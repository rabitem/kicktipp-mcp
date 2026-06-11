import * as cheerio from 'cheerio';
import type { Fixture } from '../domain/types.js';
import { cleanText, looksLikeKickoff, parseScoreText } from './text.js';

export function parseSchedule(html: string): Fixture[] {
  const $ = cheerio.load(html);
  const fixtures = new Map<number, Fixture>();

  $('tr[data-url*="tippspielId="]').each((_, element) => {
    const row = $(element);
    const dataUrl = row.attr('data-url') || '';
    const matchId = Number((dataUrl.match(/tippspielId=([0-9]+)/) || [])[1]);
    if (!Number.isFinite(matchId) || matchId <= 0 || fixtures.has(matchId)) return;

    const cells = row.find('td');
    const kickoff = cleanText(cells.eq(0).text());
    const tipDeadline = cleanText(cells.eq(1).text());
    const home = cleanText(cells.eq(2).text()) || cleanText(cells.eq(1).text());
    const away = cleanText(cells.eq(3).text()) || cleanText(cells.eq(2).text());
    const resultCell = cells.eq(4);
    const homeText = cleanText(resultCell.find('.kicktipp-heim').text());
    const awayText = cleanText(resultCell.find('.kicktipp-gast').text());
    const homeScore = /^\d+$/.test(homeText) ? Number(homeText) : null;
    const awayScore = /^\d+$/.test(awayText) ? Number(awayText) : null;
    const scoreFromSpans = homeScore == null || awayScore == null ? null : { home: homeScore, away: awayScore };
    const fallbackScore = parseScoreText(cleanText(resultCell.text()));

    fixtures.set(matchId, {
      matchId,
      home,
      away,
      kickoff: looksLikeKickoff(kickoff) ? kickoff : null,
      tipDeadline: looksLikeKickoff(tipDeadline) ? tipDeadline : null,
      result: scoreFromSpans || fallbackScore,
      scoringRuleText: cleanText(cells.eq(5).text()) || null,
    });
  });

  return [...fixtures.values()];
}
