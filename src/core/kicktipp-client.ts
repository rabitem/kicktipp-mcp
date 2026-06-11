import type {
  BetFormMatch,
  Community,
  Fixture,
  MatchdayDistribution,
  Prediction,
  RiskProfile,
  ScoringRules,
  Standing,
  SubmitTipDiff,
  SubmitTipInput,
  TipDistribution,
  TipResearchMatch,
  TipResearchPack,
} from '../domain/types.js';
import { AuthError, ParseError, UnsafeWriteError } from '../errors.js';
import type { HttpResponse } from '../http/client.js';
import { KicktippSession } from '../auth/session.js';
import { createUrls } from '../urls.js';
import { parseBetForm } from '../scrape/bet-form.js';
import { parseCommunities } from '../scrape/communities.js';
import { parseDistribution } from '../scrape/distribution.js';
import { parseOverview } from '../scrape/overview.js';
import { parseRules } from '../scrape/rules.js';
import { parseSchedule } from '../scrape/schedule.js';
import { parseStandings } from '../scrape/standings.js';
import { predictFromOdds, runCouncils } from '../predict/councils.js';
import type { KicktippConfig } from '../config.js';

export class KicktippClient {
  private readonly urls;

  constructor(
    private readonly config: KicktippConfig,
    private readonly session: KicktippSessionLike = new KicktippSession(config),
  ) {
    this.urls = createUrls(config.baseUrl);
  }

  async status() {
    const auth = await this.session.authState();
    const communities = auth.loggedIn ? await this.listCommunities().catch(() => [] as Community[]) : [];
    return {
      baseUrl: this.config.baseUrl,
      defaultCommunity: this.config.defaultCommunity,
      auth,
      communities,
      safety: {
        submitRequiresDryRunFalse: true,
        submitRequiresConfirmation: 'SUBMIT_TIPS',
      },
    };
  }

  async listCommunities(): Promise<Community[]> {
    const client = await this.session.client();
    const response = await client.get(this.urls.myCommunities());
    const communities = parseCommunities(response.html);
    if (!communities.length) {
      throw new ParseError('no Kicktipp communities found on profile page');
    }
    return communities;
  }

  async getSchedule(options: { community: string; spieltagIndex?: number }): Promise<Fixture[]> {
    const response = await this.publicClient().get(this.urls.schedule(options.community, options.spieltagIndex));
    return parseSchedule(response.html);
  }

  async getStandings(options: { community: string }): Promise<Standing[]> {
    const response = await this.publicClient().get(this.urls.standings(options.community));
    return parseStandings(response.html);
  }

  async getRules(options: { community: string }): Promise<ScoringRules> {
    const response = await this.publicClient().get(this.urls.rules(options.community));
    return parseRules(response.html);
  }

  async getMatchdayForm(options: { community: string; spieltagIndex?: number }): Promise<BetFormMatch[]> {
    const client = await this.session.client();
    const response = await client.get(this.urls.betForm(options.community, options.spieltagIndex));
    return parseBetForm(response.html).matches;
  }

  async getTipDistribution(options: { community: string; spieltagIndex?: number }): Promise<MatchdayDistribution> {
    const client = this.publicClient();
    const overviewResponse = await client.get(this.urls.overview(options.community, options.spieltagIndex));
    const overview = parseOverview(overviewResponse.html);
    const matches: TipDistribution[] = [];
    let visibility: string | null = null;

    for (const match of overview.matches) {
      const detailResponse = await client.get(this.urls.matchDetail(options.community, match.matchId));
      const parsed = parseDistribution(detailResponse.html);
      visibility = visibility ?? parsed.visibility;
      matches.push({
        matchId: match.matchId,
        home: match.home,
        away: match.away,
        byTendency: parsed.byTendency,
        byResult: parsed.byResult,
        visibility: parsed.visibility,
        dataAvailable: parsed.dataAvailable,
      });
    }

    return {
      community: options.community,
      spieltagIndex: overview.spieltagIndex ?? options.spieltagIndex ?? null,
      visibility,
      matches,
    };
  }

  async predictFromOdds(options: { community: string; spieltagIndex?: number }): Promise<Prediction[]> {
    const [rules, form] = await Promise.all([
      this.getRules({ community: options.community }),
      this.getMatchdayForm(options),
    ]);
    return form
      .map((match) =>
        predictFromOdds(
          {
            matchId: null,
            formIndex: match.formIndex,
            home: match.home,
            away: match.away,
            kickoff: match.kickoff,
            tipDeadline: null,
            result: null,
            currentTip: match.currentTip,
            locked: match.locked,
            scoringRuleText: null,
            odds: match.odds,
            distribution: null,
            standings: { home: null, away: null },
          },
          rules,
        ),
      )
      .filter((prediction): prediction is Prediction => prediction != null);
  }

  async buildTipResearch(options: { community: string; spieltagIndex?: number }): Promise<TipResearchPack> {
    const warnings: string[] = [];
    const [rulesResult, scheduleResult, standingsResult, distributionResult, formResult] = await Promise.allSettled([
      this.getRules({ community: options.community }),
      this.getSchedule(options),
      this.getStandings({ community: options.community }),
      this.getTipDistribution(options),
      this.getMatchdayForm(options),
    ]);

    const rules =
      rulesResult.status === 'fulfilled'
        ? rulesResult.value
        : ({
            tendency: 2,
            goalDifference: 3,
            exact: 4,
            dynamic: false,
            min: null,
            max: null,
            raw: '',
            assumption: 'fallback static rules because Kicktipp Spielregeln could not be parsed',
          } satisfies ScoringRules);
    if (rulesResult.status === 'rejected') warnings.push(`rules unavailable: ${reasonOf(rulesResult.reason)}`);

    const schedule = scheduleResult.status === 'fulfilled' ? scheduleResult.value : [];
    if (scheduleResult.status === 'rejected') warnings.push(`schedule unavailable: ${reasonOf(scheduleResult.reason)}`);

    const standings = standingsResult.status === 'fulfilled' ? standingsResult.value : [];
    if (standingsResult.status === 'rejected') warnings.push(`standings unavailable: ${reasonOf(standingsResult.reason)}`);

    const distribution = distributionResult.status === 'fulfilled' ? distributionResult.value : null;
    if (distributionResult.status === 'rejected') warnings.push(`tip distribution unavailable: ${reasonOf(distributionResult.reason)}`);

    const form = formResult.status === 'fulfilled' ? formResult.value : [];
    if (formResult.status === 'rejected' && !(formResult.reason instanceof AuthError)) {
      warnings.push(`bet form unavailable: ${reasonOf(formResult.reason)}`);
    }
    if (formResult.status === 'rejected' && formResult.reason instanceof AuthError) {
      warnings.push('account-specific bet form unavailable: configure credentials to include your current tips, form indexes, and odds');
    }

    const matches = mergeResearchMatches(schedule, form, distribution?.matches ?? [], standings);

    return {
      community: options.community,
      spieltagIndex: distribution?.spieltagIndex ?? options.spieltagIndex ?? null,
      generatedAt: new Date().toISOString(),
      rules,
      matches,
      warnings,
    };
  }

  async runTipCouncil(options: {
    community: string;
    spieltagIndex?: number;
    riskProfile?: RiskProfile;
  }) {
    const pack = await this.buildTipResearch(options);
    return runCouncils(pack, options.riskProfile ?? 'balanced');
  }

  async submitTips(options: {
    community: string;
    spieltagIndex?: number;
    tips: SubmitTipInput[];
    dryRun?: boolean;
    override?: boolean;
    confirmation?: string;
  }): Promise<{ submitted: boolean; dryRun: boolean; diffs: SubmitTipDiff[] }> {
    const dryRun = options.dryRun ?? true;
    if (!dryRun && options.confirmation !== 'SUBMIT_TIPS') {
      throw new UnsafeWriteError('real submissions require confirmation="SUBMIT_TIPS"');
    }

    const client = await this.session.client();
    const response = await client.get(this.urls.betForm(options.community, options.spieltagIndex));
    const form = parseBetForm(response.html);
    const tipByIndex = new Map(options.tips.map((tip) => [tip.formIndex, tip]));

    const diffs: SubmitTipDiff[] = form.matches
      .filter((match) => tipByIndex.has(match.formIndex))
      .map((match) => {
        const tip = tipByIndex.get(match.formIndex)!;
        const alreadySet = match.currentTip != null;
        const skipped = match.locked || (!options.override && alreadySet);
        return {
          formIndex: match.formIndex,
          home: match.home,
          away: match.away,
          from: match.currentTip,
          to: { home: tip.home, away: tip.away },
          skipped,
          reason: match.locked ? 'match locked' : !options.override && alreadySet ? 'existing tip; pass override=true to replace' : null,
        };
      });

    if (dryRun) return { submitted: false, dryRun, diffs };

    const fields: Record<string, string> = { ...form.fields, submitbutton: 'submit' };
    for (const match of form.matches) {
      fields[match.homeInputName] = match.currentTip ? String(match.currentTip.home) : '';
      fields[match.awayInputName] = match.currentTip ? String(match.currentTip.away) : '';
    }
    for (const diff of diffs) {
      if (diff.skipped) continue;
      const match = form.matches.find((candidate) => candidate.formIndex === diff.formIndex);
      if (!match) continue;
      fields[match.homeInputName] = String(diff.to.home);
      fields[match.awayInputName] = String(diff.to.away);
    }

    await client.postForm(this.urls.betForm(options.community, options.spieltagIndex), fields);
    return { submitted: true, dryRun, diffs };
  }

  private publicClient(): KicktippHttpClient {
    return this.session.publicClient();
  }
}

export type KicktippHttpClient = {
  get(url: string): Promise<HttpResponse>;
  postForm(url: string, form: Record<string, string>): Promise<HttpResponse>;
};

export type KicktippSessionLike = {
  publicClient(): KicktippHttpClient;
  client(): Promise<KicktippHttpClient>;
  authState(): Promise<{ configured: boolean; loggedIn: boolean; reason: string | null }>;
};

function mergeResearchMatches(
  schedule: Fixture[],
  form: BetFormMatch[],
  distribution: TipDistribution[],
  standings: Standing[],
): TipResearchMatch[] {
  const rows: TipResearchMatch[] = [];
  const distributionById = new Map(distribution.map((row) => [row.matchId, row]));
  const formByNames = new Map(form.map((row) => [nameKey(row.home, row.away), row]));
  const standingByTeam = new Map(standings.map((row) => [normalizeTeam(row.team), row]));

  for (const fixture of schedule) {
    const formMatch = formByNames.get(nameKey(fixture.home, fixture.away)) ?? null;
    rows.push({
      matchId: fixture.matchId,
      formIndex: formMatch?.formIndex ?? null,
      home: fixture.home,
      away: fixture.away,
      kickoff: fixture.kickoff,
      tipDeadline: fixture.tipDeadline,
      result: fixture.result,
      currentTip: formMatch?.currentTip ?? null,
      locked: formMatch?.locked ?? false,
      scoringRuleText: fixture.scoringRuleText,
      odds: formMatch?.odds ?? null,
      distribution: distributionById.get(fixture.matchId) ?? null,
      standings: {
        home: standingByTeam.get(normalizeTeam(fixture.home)) ?? null,
        away: standingByTeam.get(normalizeTeam(fixture.away)) ?? null,
      },
    });
  }

  if (rows.length === 0) {
    for (const formMatch of form) {
      rows.push({
        matchId: null,
        formIndex: formMatch.formIndex,
        home: formMatch.home,
        away: formMatch.away,
        kickoff: formMatch.kickoff,
        tipDeadline: null,
        result: null,
        currentTip: formMatch.currentTip,
        locked: formMatch.locked,
        scoringRuleText: null,
        odds: formMatch.odds,
        distribution: null,
        standings: {
          home: standingByTeam.get(normalizeTeam(formMatch.home)) ?? null,
          away: standingByTeam.get(normalizeTeam(formMatch.away)) ?? null,
        },
      });
    }
  }

  return rows;
}

function normalizeTeam(team: string): string {
  return team
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\b(fc|sc|sv|vfb|bor|borussia|1)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function nameKey(home: string, away: string): string {
  return `${normalizeTeam(home)}:${normalizeTeam(away)}`;
}

function reasonOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
