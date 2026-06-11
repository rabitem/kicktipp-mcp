import type { Odds, Tendency, TendencyProbabilities } from '../domain/types.js';

export function demarginOdds(odds: Odds): TendencyProbabilities {
  const raw = {
    home: 1 / odds.home,
    draw: 1 / odds.draw,
    away: 1 / odds.away,
  };
  const sum = raw.home + raw.draw + raw.away;
  return {
    home: raw.home / sum,
    draw: raw.draw / sum,
    away: raw.away / sum,
  };
}

export function tendencyOf(home: number, away: number): Tendency {
  if (home > away) return 'home';
  if (home < away) return 'away';
  return 'draw';
}

export function leadingTendency(probabilities: TendencyProbabilities): Tendency {
  return (Object.entries(probabilities) as Array<[Tendency, number]>).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'draw';
}

export function normalizeTendency(values: Partial<Record<Tendency, number>>): TendencyProbabilities | null {
  const home = values.home ?? 0;
  const draw = values.draw ?? 0;
  const away = values.away ?? 0;
  const sum = home + draw + away;
  if (sum <= 0) return null;
  return { home: home / sum, draw: draw / sum, away: away / sum };
}
