#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { importChromeKicktippSession } from '../auth/chrome-session.js';
import { loadConfig, requireCommunity } from '../config.js';
import { KicktippClient } from '../core/kicktipp-client.js';
import type { RiskProfile, SubmitTipInput } from '../domain/types.js';

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      community: { type: 'string', short: 'c' },
      matchday: { type: 'string', short: 'd' },
      risk: { type: 'string' },
      scores: { type: 'string' },
      profile: { type: 'string' },
      yes: { type: 'boolean', default: false },
      override: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help || positionals.length === 0) {
    console.log(helpText());
    return;
  }

  const command = positionals[0];
  const config = loadConfig();
  const client = new KicktippClient(config);
  const community = () => requireCommunity(config, values.community || positionals[1]);
  const spieltagIndex = values.matchday ? Number(values.matchday) : undefined;
  const communityOptions = () => withMatchday(community(), spieltagIndex);

  let result: unknown;
  switch (command) {
    case 'status':
      result = await client.status();
      break;
    case 'import-chrome-session':
      result = await importChromeKicktippSession(config, {
        ...(values.profile ? { profilePath: values.profile } : {}),
      });
      break;
    case 'communities':
      result = await client.listCommunities();
      break;
    case 'schedule':
      result = await client.getSchedule(communityOptions());
      break;
    case 'standings':
      result = await client.getStandings({ community: community() });
      break;
    case 'rules':
      result = await client.getRules({ community: community() });
      break;
    case 'distribution':
      result = await client.getTipDistribution(communityOptions());
      break;
    case 'form':
      result = await client.getMatchdayForm(communityOptions());
      break;
    case 'predict':
      result = await client.predictFromOdds(communityOptions());
      break;
    case 'research':
      result = await client.buildTipResearch(communityOptions());
      break;
    case 'council':
      {
        const riskProfile = parseRisk(values.risk);
        result = await client.runTipCouncil({
          community: community(),
          ...(spieltagIndex !== undefined ? { spieltagIndex } : {}),
          ...(riskProfile !== undefined ? { riskProfile } : {}),
        });
      }
      break;
    case 'submit':
      if (!values.scores) throw new Error('submit requires --scores formIndex=H:A[,formIndex=H:A]');
      result = await client.submitTips({
        community: community(),
        tips: parseScores(values.scores),
        dryRun: !values.yes,
        override: Boolean(values.override),
        ...(spieltagIndex !== undefined ? { spieltagIndex } : {}),
        ...(values.yes ? { confirmation: 'SUBMIT_TIPS' } : {}),
      });
      break;
    default:
      throw new Error(`unknown command: ${command}`);
  }

  print(result, Boolean(values.json));
}

function withMatchday(community: string, spieltagIndex: number | undefined): { community: string; spieltagIndex?: number } {
  return {
    community,
    ...(spieltagIndex !== undefined ? { spieltagIndex } : {}),
  };
}

function parseScores(raw: string): SubmitTipInput[] {
  return raw.split(',').map((entry) => {
    const match = entry.trim().match(/^(\d+)=(\d+):(\d+)$/);
    if (!match) throw new Error(`invalid score entry "${entry}". Use formIndex=H:A`);
    return {
      formIndex: Number(match[1]),
      home: Number(match[2]),
      away: Number(match[3]),
    };
  });
}

function parseRisk(value: string | undefined): RiskProfile | undefined {
  if (!value) return undefined;
  if (!['conservative', 'balanced', 'aggressive', 'chasing', 'leading'].includes(value)) {
    throw new Error(`invalid --risk ${value}`);
  }
  return value as RiskProfile;
}

function print(result: unknown, json: boolean): void {
  if (typeof result === 'string') {
    console.log(result);
    return;
  }
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}

function helpText(): string {
  return `ktipp <command> [community] [options]

Commands:
  status                         Show auth/config status
  import-chrome-session          Import Kicktipp cookies from Chrome on macOS
  communities                    List authenticated account communities
  schedule [community]           Public fixtures/results
  standings [community]          Public league table
  rules [community]              Public scoring rules
  distribution [community]       Visible Tippverteilung
  form [community]               Authenticated tippabgabe form
  predict [community]            Odds-based predictions from authenticated form
  research [community]           Build matchday research pack
  council [community]            Run agent councils
  submit [community]             Dry-run or submit tips

Options:
  -c, --community <slug>          Override KICKTIPP_DEFAULT_COMMUNITY
  -d, --matchday <n>              Kicktipp spieltagIndex
      --risk <profile>           conservative|balanced|aggressive|chasing|leading
      --scores <pairs>           formIndex=H:A[,formIndex=H:A]
      --profile <path>           Chrome profile path for import-chrome-session
      --yes                      Real submit. Default submit is dry-run.
      --override                 Replace existing tips during submit
      --json                     JSON output
`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
