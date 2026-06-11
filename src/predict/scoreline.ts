import type { ScoringRules, Score, Tendency, TendencyProbabilities } from '../domain/types.js';
import { tendencyOf } from './probability.js';

const CANONICAL: Record<Tendency, Score[]> = {
  home: [
    { home: 1, away: 0 },
    { home: 2, away: 1 },
    { home: 2, away: 0 },
    { home: 3, away: 1 },
    { home: 3, away: 0 },
  ],
  draw: [
    { home: 1, away: 1 },
    { home: 0, away: 0 },
    { home: 2, away: 2 },
  ],
  away: [
    { home: 0, away: 1 },
    { home: 1, away: 2 },
    { home: 0, away: 2 },
    { home: 1, away: 3 },
    { home: 0, away: 3 },
  ],
};

export function bestExpectedScoreline(
  probabilities: TendencyProbabilities,
  rules: ScoringRules,
  maxGoals = 5,
): { score: Score; expectedPoints: number; rationale: string } {
  const outcomes = scorelineDistribution(probabilities);
  let bestScore: Score = { home: 1, away: 1 };
  let bestExpectedPoints = Number.NEGATIVE_INFINITY;

  for (let home = 0; home <= maxGoals; home += 1) {
    for (let away = 0; away <= maxGoals; away += 1) {
      const tip = { home, away };
      const expectedPoints = outcomes.reduce(
        (sum, outcome) => sum + outcome.probability * pointsFor(tip, outcome.score, rules),
        0,
      );
      if (expectedPoints > bestExpectedPoints) {
        bestExpectedPoints = expectedPoints;
        bestScore = tip;
      }
    }
  }

  return {
    score: bestScore,
    expectedPoints: Number(bestExpectedPoints.toFixed(3)),
    rationale: `max expected points over 0-${maxGoals} goals using p(H/D/A) ${probabilities.home.toFixed(2)}/${probabilities.draw.toFixed(2)}/${probabilities.away.toFixed(2)}`,
  };
}

export function pointsFor(tip: Score, actual: Score, rules: ScoringRules): number {
  if (tip.home === actual.home && tip.away === actual.away) return rules.exact;
  if (tendencyOf(tip.home, tip.away) !== tendencyOf(actual.home, actual.away)) return 0;
  if (tip.home - tip.away === actual.home - actual.away) return rules.goalDifference;
  return rules.tendency;
}

function scorelineDistribution(probabilities: TendencyProbabilities): Array<{ score: Score; probability: number }> {
  const rows: Array<{ score: Score; probability: number }> = [];
  for (const tendency of Object.keys(CANONICAL) as Tendency[]) {
    const scorelines = CANONICAL[tendency];
    const weights = scorelines.map((_, index) => 1 / (index + 1));
    const weightSum = weights.reduce((sum, value) => sum + value, 0);
    scorelines.forEach((score, index) => {
      rows.push({
        score,
        probability: (probabilities[tendency] * (weights[index] ?? 0)) / weightSum,
      });
    });
  }
  return rows;
}
