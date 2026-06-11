import * as cheerio from 'cheerio';
import type { MatchOverview } from '../domain/types.js';
import { cleanText, looksLikeKickoff } from './text.js';

export function parseOverview(html: string): { spieltagIndex: number | null; matches: MatchOverview[] } {
  const $ = cheerio.load(html);
  const matches = new Map<number, MatchOverview>();
  let spieltagIndex: number | null = null;

  $('tr[data-url*="tippspielId="]').each((_, element) => {
    const row = $(element);
    const dataUrl = row.attr('data-url') || '';
    const matchId = Number((dataUrl.match(/tippspielId=([0-9]+)/) || [])[1]);
    if (!Number.isFinite(matchId) || matchId <= 0 || matches.has(matchId)) return;
    if (spieltagIndex == null) {
      const parsedSpieltag = Number((dataUrl.match(/spieltagIndex=([0-9]+)/) || [])[1]);
      spieltagIndex = Number.isFinite(parsedSpieltag) && parsedSpieltag > 0 ? parsedSpieltag : null;
    }

    const cells = row.find('td');
    const kickoff = cleanText(cells.eq(0).text());
    matches.set(matchId, {
      matchId,
      home: cleanText(cells.eq(1).text()),
      away: cleanText(cells.eq(2).text()),
      kickoff: looksLikeKickoff(kickoff) ? kickoff : null,
    });
  });

  return { spieltagIndex, matches: [...matches.values()] };
}
