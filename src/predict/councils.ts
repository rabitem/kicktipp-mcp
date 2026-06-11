import type {
  CouncilRecommendation,
  Prediction,
  RiskProfile,
  Score,
  ScoringRules,
  Standing,
  Tendency,
  TipDistribution,
  TipResearchMatch,
  TipResearchPack,
} from '../domain/types.js';
import { demarginOdds, leadingTendency, normalizeTendency, tendencyOf } from './probability.js';
import { bestExpectedScoreline } from './scoreline.js';

export function predictFromOdds(match: TipResearchMatch, rules: ScoringRules): Prediction | null {
  if (!match.odds) return null;
  const probabilities = demarginOdds(match.odds);
  const best = bestExpectedScoreline(probabilities, rules);
  const spread = Math.max(probabilities.home, probabilities.draw, probabilities.away) - Math.min(probabilities.home, probabilities.draw, probabilities.away);

  return {
    ref: {
      ...(match.formIndex != null ? { formIndex: match.formIndex } : {}),
      ...(match.matchId != null ? { matchId: match.matchId } : {}),
    },
    home: match.home,
    away: match.away,
    score: best.score,
    probabilities,
    expectedPoints: best.expectedPoints,
    confidence: clamp(0.45 + spread),
    strategy: 'market_expected_points',
    rationale: best.rationale,
  };
}

export function runCouncils(pack: TipResearchPack, riskProfile: RiskProfile = 'balanced'): {
  community: string;
  spieltagIndex: number | null;
  riskProfile: RiskProfile;
  generatedAt: string;
  warnings: string[];
  recommendations: CouncilRecommendation[];
} {
  const recommendations: CouncilRecommendation[] = [];

  for (const match of pack.matches) {
    const perMatch = [
      marketCouncil(match, pack.rules),
      crowdCouncil(match),
      tableCouncil(match),
      rulesCouncil(match, pack.rules),
      contrarianCouncil(match, riskProfile),
    ].filter((recommendation): recommendation is CouncilRecommendation => recommendation != null);

    recommendations.push(...perMatch);
    const consensus = consensusCouncil(match, perMatch, riskProfile);
    if (consensus) recommendations.push(consensus);
  }

  return {
    community: pack.community,
    spieltagIndex: pack.spieltagIndex,
    riskProfile,
    generatedAt: new Date().toISOString(),
    warnings: pack.warnings,
    recommendations,
  };
}

function marketCouncil(match: TipResearchMatch, rules: ScoringRules): CouncilRecommendation | null {
  const prediction = predictFromOdds(match, rules);
  if (!prediction) return null;
  return baseRecommendation('market', match, prediction.score, prediction.confidence, prediction.rationale, {
    odds: match.odds,
    probabilities: prediction.probabilities,
    expectedPoints: prediction.expectedPoints,
  });
}

function crowdCouncil(match: TipResearchMatch): CouncilRecommendation | null {
  const distribution = match.distribution;
  if (!distribution?.dataAvailable) return null;

  const topResult = distribution.byResult[0];
  if (topResult) {
    const score = scoreFromString(topResult.score);
    if (score) {
      return baseRecommendation(
        'crowd',
        match,
        score,
        clamp(0.35 + topResult.pct / 100),
        `most common visible crowd result is ${topResult.score} (${topResult.pct}%)`,
        { distribution },
      );
    }
  }

  if (distribution.byTendency) {
    const normalized = normalizeTendency(distribution.byTendency);
    if (!normalized) return null;
    return baseRecommendation(
      'crowd',
      match,
      defaultScoreForTendency(leadingTendency(normalized)),
      clamp(0.35 + Math.max(...Object.values(normalized)) / 2),
      'uses the visible Kicktipp crowd tendency because exact-result distribution is unavailable',
      { distribution },
    );
  }

  return null;
}

function tableCouncil(match: TipResearchMatch): CouncilRecommendation | null {
  const home = match.standings.home;
  const away = match.standings.away;
  if (!home || !away || home.played === 0 || away.played === 0) return null;

  const rankDelta = away.rank - home.rank;
  const pointsDelta = home.points - away.points;
  const tendency: Tendency = Math.abs(rankDelta) <= 2 && Math.abs(pointsDelta) <= 3 ? 'draw' : rankDelta > 0 ? 'home' : 'away';
  const score = defaultScoreForTendency(tendency);

  return baseRecommendation(
    'table',
    match,
    score,
    clamp(0.42 + Math.min(0.25, Math.abs(pointsDelta) / 60 + Math.abs(rankDelta) / 80)),
    `table comparison: ${match.home} rank ${home.rank}/${home.points} pts, ${match.away} rank ${away.rank}/${away.points} pts`,
    { homeStanding: compactStanding(home), awayStanding: compactStanding(away), rankDelta, pointsDelta },
  );
}

function rulesCouncil(match: TipResearchMatch, rules: ScoringRules): CouncilRecommendation | null {
  const score = match.odds ? bestExpectedScoreline(demarginOdds(match.odds), rules).score : { home: 1, away: 1 };
  const reason = rules.dynamic
    ? 'dynamic Kicktipp scoring detected; prefers common scorelines that keep exact-result upside without overfitting'
    : 'static scoring detected; prefers the scoreline with the best exact/difference/tendency tradeoff';
  return baseRecommendation('rules', match, score, rules.dynamic ? 0.48 : 0.52, reason, {
    rules: {
      tendency: rules.tendency,
      goalDifference: rules.goalDifference,
      exact: rules.exact,
      dynamic: rules.dynamic,
      min: rules.min,
      max: rules.max,
      assumption: rules.assumption,
    },
  });
}

function contrarianCouncil(match: TipResearchMatch, riskProfile: RiskProfile): CouncilRecommendation | null {
  if (!['aggressive', 'chasing'].includes(riskProfile)) return null;
  const distribution = match.distribution;
  const market = match.odds ? demarginOdds(match.odds) : null;
  const crowd = distribution?.byTendency ? normalizeTendency(distribution.byTendency) : null;
  if (!market || !crowd) return null;

  const candidates = (['home', 'draw', 'away'] as Tendency[])
    .map((tendency) => ({
      tendency,
      market: market[tendency],
      crowd: crowd[tendency],
      value: market[tendency] - crowd[tendency],
    }))
    .filter((candidate) => candidate.market >= 0.2)
    .sort((a, b) => b.value - a.value);

  const pick = candidates[0];
  if (!pick || pick.value <= 0.08) return null;

  return baseRecommendation(
    'contrarian',
    match,
    defaultScoreForTendency(pick.tendency),
    clamp(0.36 + pick.value),
    `contrarian value: market probability exceeds visible crowd share by ${(pick.value * 100).toFixed(1)} percentage points`,
    { market, crowd, pick },
  );
}

function consensusCouncil(
  match: TipResearchMatch,
  recommendations: CouncilRecommendation[],
  riskProfile: RiskProfile,
): CouncilRecommendation | null {
  if (!recommendations.length) return null;

  const scores = new Map<string, { score: Score; confidence: number; councils: string[] }>();
  for (const recommendation of recommendations) {
    if (!recommendation.score) continue;
    const key = `${recommendation.score.home}:${recommendation.score.away}`;
    const existing = scores.get(key);
    if (existing) {
      existing.confidence += recommendation.confidence;
      existing.councils.push(recommendation.council);
    } else {
      scores.set(key, {
        score: recommendation.score,
        confidence: recommendation.confidence,
        councils: [recommendation.council],
      });
    }
  }

  const ranked = [...scores.values()].sort((a, b) => {
    if (riskProfile === 'leading') return tendencyRisk(a.score) - tendencyRisk(b.score) || b.confidence - a.confidence;
    if (riskProfile === 'chasing') return b.confidence + tendencyRisk(b.score) * 0.1 - (a.confidence + tendencyRisk(a.score) * 0.1);
    return b.confidence - a.confidence;
  });

  const winner = ranked[0];
  if (!winner) return null;

  return baseRecommendation(
    'consensus',
    match,
    winner.score,
    clamp(winner.confidence / Math.max(1, recommendations.length)),
    `weighted council consensus from ${winner.councils.join(', ')}`,
    { councilVotes: ranked },
  );
}

function baseRecommendation(
  council: CouncilRecommendation['council'],
  match: TipResearchMatch,
  score: Score | null,
  confidence: number,
  rationale: string,
  evidence: Record<string, unknown>,
): CouncilRecommendation {
  return {
    council,
    home: match.home,
    away: match.away,
    ...(match.matchId != null ? { matchId: match.matchId } : {}),
    ...(match.formIndex != null ? { formIndex: match.formIndex } : {}),
    score,
    tendency: score ? tendencyOf(score.home, score.away) : null,
    confidence: Number(clamp(confidence).toFixed(3)),
    rationale,
    evidence,
  };
}

function defaultScoreForTendency(tendency: Tendency): Score {
  if (tendency === 'home') return { home: 2, away: 1 };
  if (tendency === 'away') return { home: 1, away: 2 };
  return { home: 1, away: 1 };
}

function scoreFromString(value: string): Score | null {
  const match = value.match(/(\d+)\s*[:\-]\s*(\d+)/);
  if (!match) return null;
  return { home: Number(match[1]), away: Number(match[2]) };
}

function compactStanding(standing: Standing) {
  return {
    rank: standing.rank,
    played: standing.played,
    points: standing.points,
    goalDifference: standing.goalDifference,
  };
}

function tendencyRisk(score: Score): number {
  if (score.home === score.away) return 0.7;
  return Math.abs(score.home - score.away) >= 2 ? 0.8 : 0.45;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
