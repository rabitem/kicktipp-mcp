export type Score = {
  home: number;
  away: number;
};

export type Odds = {
  home: number;
  draw: number;
  away: number;
};

export type Tendency = 'home' | 'draw' | 'away';

export type TendencyProbabilities = Record<Tendency, number>;

export type Community = {
  slug: string;
  name: string;
};

export type Fixture = {
  matchId: number;
  home: string;
  away: string;
  kickoff: string | null;
  tipDeadline: string | null;
  result: Score | null;
  scoringRuleText: string | null;
};

export type MatchOverview = {
  matchId: number;
  home: string;
  away: string;
  kickoff: string | null;
};

export type BetFormMatch = {
  /**
   * Local index used by Kicktipp's bet-entry form input names.
   * This is deliberately separate from `matchId`; do not join it to
   * tippuebersicht/tippspielplan `tippspielId` values.
   */
  formIndex: number;
  home: string;
  away: string;
  kickoff: string | null;
  homeInputName: string;
  awayInputName: string;
  currentTip: Score | null;
  locked: boolean;
  odds: Odds | null;
};

export type TipDistribution = {
  matchId: number;
  home: string;
  away: string;
  byTendency: Record<Tendency, number> | null;
  byResult: Array<{ score: string; pct: number }>;
  visibility: string | null;
  dataAvailable: boolean;
};

export type MatchdayDistribution = {
  community: string;
  spieltagIndex: number | null;
  visibility: string | null;
  matches: TipDistribution[];
};

export type Standing = {
  rank: number;
  team: string;
  played: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
};

export type ScoringRules = {
  tendency: number;
  goalDifference: number;
  exact: number;
  dynamic: boolean;
  min: number | null;
  max: number | null;
  raw: string;
  assumption: string;
};

export type Prediction = {
  ref: { formIndex?: number; matchId?: number };
  home: string;
  away: string;
  score: Score;
  probabilities: TendencyProbabilities | null;
  expectedPoints: number | null;
  confidence: number;
  strategy: string;
  rationale: string;
};

export type RiskProfile = 'conservative' | 'balanced' | 'aggressive' | 'chasing' | 'leading';

export type CouncilName =
  | 'market'
  | 'crowd'
  | 'table'
  | 'rules'
  | 'contrarian'
  | 'consensus';

export type CouncilRecommendation = {
  council: CouncilName;
  home: string;
  away: string;
  matchId?: number;
  formIndex?: number;
  score: Score | null;
  tendency: Tendency | null;
  confidence: number;
  rationale: string;
  evidence: Record<string, unknown>;
};

export type TipResearchMatch = {
  matchId: number | null;
  formIndex: number | null;
  home: string;
  away: string;
  kickoff: string | null;
  tipDeadline: string | null;
  result: Score | null;
  currentTip: Score | null;
  locked: boolean;
  scoringRuleText: string | null;
  odds: Odds | null;
  distribution: TipDistribution | null;
  standings: {
    home: Standing | null;
    away: Standing | null;
  };
};

export type TipResearchPack = {
  community: string;
  spieltagIndex: number | null;
  generatedAt: string;
  rules: ScoringRules;
  matches: TipResearchMatch[];
  warnings: string[];
};

export type SubmitTipInput = {
  formIndex: number;
  home: number;
  away: number;
};

export type SubmitTipDiff = {
  formIndex: number;
  home: string;
  away: string;
  from: Score | null;
  to: Score;
  skipped: boolean;
  reason: string | null;
};
