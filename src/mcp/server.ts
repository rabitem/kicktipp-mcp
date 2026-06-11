import { McpServer, type ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ShapeOutput, ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { KicktippClient } from '../core/kicktipp-client.js';
import type { RiskProfile } from '../domain/types.js';

const riskProfileSchema = z.enum(['conservative', 'balanced', 'aggressive', 'chasing', 'leading']);

export function buildMcpServer(client: KicktippClient): McpServer {
  const server = new McpServer(
    {
      name: 'kicktipp-mcp',
      version: '0.1.0',
    },
    {
      instructions:
        'Use get_status first. Read-only tools can inspect public Kicktipp data. Use build_tip_research and run_tip_council before submit_tips. Never call submit_tips with dryRun=false until the user has reviewed a dry-run diff and explicitly approved submission.',
    },
  );

  registerTools(server, client);
  registerResources(server);
  registerPrompts(server);

  return server;
}

function registerTools(server: McpServer, client: KicktippClient): void {
  tool(server, 'get_status', 'Account/session status, configured community, and write-safety policy.', {}, () => client.status());

  tool(server, 'list_communities', 'List Kicktipp communities for the authenticated account.', {}, () => client.listCommunities());

  tool(
    server,
    'get_schedule',
    'Read public fixtures/results for a Kicktipp community.',
    {
      community: z.string().describe('Kicktipp community slug, e.g. bundesliga-tippspiel'),
      spieltagIndex: z.number().int().positive().optional(),
    },
    (args) => client.getSchedule(matchdayOptions(args)),
  );

  tool(
    server,
    'get_standings',
    'Read the public league table for a Kicktipp community.',
    { community: z.string() },
    (args) => client.getStandings(args),
  );

  tool(
    server,
    'get_scoring_rules',
    'Read and parse Kicktipp scoring rules for the community.',
    { community: z.string() },
    (args) => client.getRules(args),
  );

  tool(
    server,
    'get_tip_distribution',
    'Read visible public Tippverteilung/crowd distribution for a matchday.',
    {
      community: z.string(),
      spieltagIndex: z.number().int().positive().optional(),
    },
    (args) => client.getTipDistribution(matchdayOptions(args)),
  );

  tool(
    server,
    'get_matchday_form',
    'Read account-specific tippabgabe form, including form indexes, odds, current tips, and locked state. Requires authentication.',
    {
      community: z.string(),
      spieltagIndex: z.number().int().positive().optional(),
    },
    (args) => client.getMatchdayForm(matchdayOptions(args)),
  );

  tool(
    server,
    'predict_from_odds',
    'Create expected-points predictions from odds on the authenticated tippabgabe form. Requires authentication.',
    {
      community: z.string(),
      spieltagIndex: z.number().int().positive().optional(),
    },
    (args) => client.predictFromOdds(matchdayOptions(args)),
  );

  tool(
    server,
    'build_tip_research',
    'Build a research pack from schedule, standings, rules, visible crowd distribution, and authenticated form data when available.',
    {
      community: z.string(),
      spieltagIndex: z.number().int().positive().optional(),
    },
    (args) => client.buildTipResearch(matchdayOptions(args)),
  );

  tool(
    server,
    'run_tip_council',
    'Run market, crowd, table, rules, contrarian, and consensus councils for tip creation.',
    {
      community: z.string(),
      spieltagIndex: z.number().int().positive().optional(),
      riskProfile: riskProfileSchema.optional(),
    },
    (args) => {
      const options: { community: string; spieltagIndex?: number; riskProfile?: RiskProfile } = {
        community: args.community,
      };
      if (args.spieltagIndex !== undefined) options.spieltagIndex = args.spieltagIndex;
      if (args.riskProfile !== undefined) options.riskProfile = args.riskProfile as RiskProfile;
      return client.runTipCouncil(options);
    },
  );

  server.registerTool(
    'submit_tips',
    {
      description:
        'Dry-run or submit Kicktipp tips. Defaults to dryRun=true. Real writes require dryRun=false and confirmation="SUBMIT_TIPS".',
      inputSchema: {
        community: z.string(),
        spieltagIndex: z.number().int().positive().optional(),
        tips: z.array(
          z.object({
            formIndex: z.number().int().nonnegative(),
            home: z.number().int().min(0).max(20),
            away: z.number().int().min(0).max(20),
          }),
        ),
        dryRun: z.boolean().default(true),
        override: z.boolean().default(false),
        confirmation: z.string().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const options = {
        community: args.community,
        tips: args.tips,
        dryRun: args.dryRun,
        override: args.override,
        ...(args.spieltagIndex !== undefined ? { spieltagIndex: args.spieltagIndex } : {}),
        ...(args.confirmation !== undefined ? { confirmation: args.confirmation } : {}),
      };
      return jsonResult(await client.submitTips(options));
    },
  );
}

function tool<Args extends ZodRawShapeCompat>(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: Args,
  handler: (args: ShapeOutput<Args>) => Promise<unknown>,
): void {
  const callback = (async (args: ShapeOutput<Args>) =>
    jsonResult(await handler(args))) as unknown as ToolCallback<Args>;
  server.registerTool(
    name,
    {
      description,
      inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    callback,
  );
}

function matchdayOptions(args: {
  community: string;
  spieltagIndex?: number | undefined;
}): { community: string; spieltagIndex?: number } {
  return {
    community: args.community,
    ...(args.spieltagIndex !== undefined ? { spieltagIndex: args.spieltagIndex } : {}),
  };
}

function registerResources(server: McpServer): void {
  server.registerResource(
    'agent-councils',
    'kicktipp://agent-councils',
    {
      title: 'Kicktipp Agent Councils',
      description: 'Council roles and research workflow for tip creation.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: 'text/markdown',
          text: agentCouncilsText(),
        },
      ],
    }),
  );
}

function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'research_matchday',
    {
      title: 'Research Kicktipp Matchday',
      description: 'Collect Kicktipp evidence and prepare a research summary before creating tips.',
      argsSchema: {
        community: z.string(),
        spieltagIndex: z.string().optional(),
      },
    },
    (args) => ({
      description: 'Research a Kicktipp matchday without submitting tips.',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Research Kicktipp community "${args.community}"${args.spieltagIndex ? ` matchday ${args.spieltagIndex}` : ''}.`,
              'Call get_status, build_tip_research, get_tip_distribution, get_standings, and get_scoring_rules as needed.',
              'Return concise evidence per match: kickoff, rules, odds if available, crowd distribution, table context, uncertainty, and missing-data warnings.',
              'Do not call submit_tips.',
            ].join('\n'),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'create_tips_with_council',
    {
      title: 'Create Kicktipp Tips With Council',
      description: 'Run the agent councils, recommend tips, and prepare a dry-run submission payload.',
      argsSchema: {
        community: z.string(),
        spieltagIndex: z.string().optional(),
        riskProfile: z.string().optional(),
      },
    },
    (args) => ({
      description: 'Create explainable Kicktipp tip recommendations.',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Create Kicktipp tips for "${args.community}"${args.spieltagIndex ? ` matchday ${args.spieltagIndex}` : ''}.`,
              `Risk profile: ${args.riskProfile || 'balanced'}.`,
              'Call build_tip_research and run_tip_council first.',
              'Recommend a final score for each match with the council vote, evidence, and uncertainty.',
              'If formIndex values are available, prepare a submit_tips dryRun=true payload. Do not submit for real unless the user explicitly approves after seeing the diff.',
            ].join('\n'),
          },
        },
      ],
    }),
  );
}

async function jsonResult(data: unknown): Promise<CallToolResult> {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function agentCouncilsText(): string {
  return `# Kicktipp Agent Councils

Use these councils before creating tips:

- Market Council: odds-derived probabilities and expected-points scoreline.
- Crowd Council: visible Kicktipp Tippverteilung and most common public result.
- Table Council: league table/rank/points context when team names are known.
- Rules Council: scoring-rule incentives, especially dynamic Kicktipp point ranges.
- Contrarian Council: optional high-variance picks when market probability exceeds crowd share.
- Consensus Council: weighted final pick, tuned by risk profile.

Risk profiles:

- conservative: prefer consensus, favorites, and low-variance results.
- balanced: use weighted council consensus.
- aggressive: allow contrarian value when evidence supports it.
- chasing: similar to aggressive, but accepts more draw/upset exposure.
- leading: prefer defensible consensus and avoid unnecessary variance.

Workflow:

1. Call get_status.
2. Call build_tip_research.
3. Call run_tip_council with the intended riskProfile.
4. Prepare submit_tips with dryRun=true only if formIndex values are available.
5. Submit for real only after user approval, with dryRun=false and confirmation="SUBMIT_TIPS".
`;
}
