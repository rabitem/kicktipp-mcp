import type { TipDistribution } from '../domain/types.js';
import { parseGermanNumber } from './text.js';

type RawDistribution = Omit<TipDistribution, 'matchId' | 'home' | 'away'>;

export function parseDistribution(html: string): RawDistribution {
  const visibility =
    html.match(/Sichtbarkeit der Tipps<\/div><div class="spieldaten-infos-value">([^<]*)/)?.[1]?.trim() ?? null;
  const prepareBody = html.match(/function prepare\(\)\s*\{([\s\S]*?)\n\s*\}\s*function drawCharts/)?.[1] ?? '';
  const segments = prepareBody.split(/var id = '([a-zA-Z]+)'/);
  const charts: Record<string, string[][]> = {};

  for (let index = 1; index < segments.length; index += 2) {
    const id = segments[index] || '';
    const segment = segments[index + 1] || '';
    charts[id] = [...segment.matchAll(/data\.addRow\(\[([^\]]*)\]\)/g)].map((match) =>
      splitChartRow(match[1] || ''),
    );
  }

  const tendencyRows = charts.tippverteilungNachTendenz || [];
  const tendencyMap = new Map<string, number>();
  for (const row of tendencyRows) {
    const label = (row[0] || '').toLowerCase();
    const value = Number(row[1] || 0);
    if (label) tendencyMap.set(label, value);
  }

  const byTendency = tendencyRows.length
    ? {
        home: tendencyMap.get('heim') ?? 0,
        draw: tendencyMap.get('remis') ?? 0,
        away: tendencyMap.get('gast') ?? 0,
      }
    : null;

  const byResult = (charts.tippverteilungNachErgebnis || [])
    .filter((row) => row.length >= 2)
    .map((row) => ({ score: row[0] || '', pct: parseGermanNumber(row[row.length - 1] || '') ?? 0 }))
    .filter((row) => row.score && row.pct > 0);

  const dataAvailable = byResult.length > 0 || Boolean(byTendency && byTendency.home + byTendency.draw + byTendency.away > 0);
  return {
    byTendency: dataAvailable ? byTendency : null,
    byResult,
    visibility,
    dataAvailable,
  };
}

function splitChartRow(row: string): string[] {
  const output: string[] = [];
  let current = '';
  let quote: string | null = null;

  for (const character of row) {
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === ',') {
      output.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }

  if (current.trim()) output.push(current.trim());
  return output;
}
