import * as cheerio from 'cheerio';
import type { ScoringRules } from '../domain/types.js';
import { cleanText } from './text.js';

export function parseRules(html: string): ScoringRules {
  const $ = cheerio.load(html);
  const text = cleanText($('.pagecontent').text() || $.root().text());
  const dynamicRange = text.match(/Punkteregel:\s*(\d+)\s*-\s*(\d+)\s*Punkte/i);
  const min = dynamicRange ? Number(dynamicRange[1]) : null;
  const max = dynamicRange ? Number(dynamicRange[2]) : null;
  const dynamic = Boolean(dynamicRange || /Punkte hängen von der Quote/i.test(text));

  if (dynamic && min != null && max != null) {
    const base = Math.max(min, Math.round((min + max) / 2));
    return {
      tendency: base,
      goalDifference: base + 1,
      exact: base + 2,
      dynamic,
      min,
      max,
      raw: text,
      assumption:
        'Dynamic Kicktipp scoring detected. Expected-points calculations use the midpoint of the visible range as a conservative base, plus parsed/known differential and exact bonuses.',
    };
  }

  const exact = findNear(text, /Ergebnis|genaue[s]? Ergebnis|richtige Antwort/) ?? 4;
  const goalDifference = findNear(text, /Tordifferenz|Differenz/) ?? Math.max(3, exact - 1);
  const tendency = findNear(text, /Tendenz|Sieger/) ?? Math.max(2, goalDifference - 1);

  return {
    tendency,
    goalDifference,
    exact,
    dynamic,
    min,
    max,
    raw: text,
    assumption: 'Static scoring inferred from the Spielregeln page, with standard Kicktipp fallbacks where labels were missing.',
  };
}

function findNear(text: string, label: RegExp): number | null {
  const match = text.match(new RegExp(`${label.source}[^0-9]{0,60}(\\d+)`, 'i'));
  if (!match) return null;
  const parsed = Number.parseInt(match[1] || '', 10);
  return Number.isFinite(parsed) ? parsed : null;
}
