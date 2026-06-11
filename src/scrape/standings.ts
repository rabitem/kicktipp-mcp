import * as cheerio from 'cheerio';
import type { Standing } from '../domain/types.js';
import { cleanText } from './text.js';

export function parseStandings(html: string): Standing[] {
  const $ = cheerio.load(html);
  const standings: Standing[] = [];

  $('table.sporttabelle tbody tr, table tbody tr').each((_, element) => {
    const row = $(element);
    const cells = row.find('td');
    if (cells.length < 5) return;

    const rank = Number.parseInt(cleanText(cells.eq(0).text()).replace('.', ''), 10);
    const teamCell = row.find('td.mannschaft').first();
    const team = cleanText(teamCell.find('div').text()) || cleanText(cells.eq(1).text());
    if (!Number.isFinite(rank) || !team) return;

    const played = numberFromText(cells.eq(2).text());
    const points = numberFromText(cells.eq(3).text());
    const goals = cleanText(cells.eq(4).text()).split(':').map((part) => Number.parseInt(part, 10));
    const parsedGoalsFor = goals[0];
    const parsedGoalsAgainst = goals[1];
    const goalsFor = typeof parsedGoalsFor === 'number' && Number.isFinite(parsedGoalsFor) ? parsedGoalsFor : 0;
    const goalsAgainst =
      typeof parsedGoalsAgainst === 'number' && Number.isFinite(parsedGoalsAgainst) ? parsedGoalsAgainst : 0;

    standings.push({
      rank,
      team,
      played,
      points,
      goalsFor,
      goalsAgainst,
      goalDifference: goalsFor - goalsAgainst,
    });
  });

  return dedupeStandings(standings);
}

function numberFromText(text: string): number {
  const parsed = Number.parseInt(cleanText(text), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dedupeStandings(rows: Standing[]): Standing[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.team.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
