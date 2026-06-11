import type { Odds } from '../domain/types.js';
import { parseGermanNumber } from './text.js';

export function parseOdds(textOrHtml: string): Odds | null {
  const values = [...textOrHtml.matchAll(/(?<!\d)(\d{1,2}(?:[,.]\d{1,3})?)(?!\d)/g)]
    .map((match) => parseGermanNumber(match[1] ?? ''))
    .filter((value): value is number => value != null && value > 1);

  if (values.length < 3) return null;
  const [home, draw, away] = values.slice(-3);
  if (!home || !draw || !away) return null;
  return { home, draw, away };
}
