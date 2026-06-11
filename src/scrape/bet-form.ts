import * as cheerio from 'cheerio';
import type { BetFormMatch } from '../domain/types.js';
import { ParseError } from '../errors.js';
import { parseOdds } from './odds.js';
import { cleanText, looksLikeKickoff } from './text.js';

export type ParsedBetForm = {
  fields: Record<string, string>;
  matches: BetFormMatch[];
};

export function parseBetForm(html: string): ParsedBetForm {
  const $ = cheerio.load(html);
  const form = $('form').has('input[name*="heimTipp"], input[id$="_heimTipp"]').first();
  const root = form.length ? form : $.root();

  const fields: Record<string, string> = {};
  root.find('input[type="hidden"]').each((_, element) => {
    const name = $(element).attr('name');
    if (!name) return;
    fields[name] = $(element).attr('value') || '';
  });

  const table = $('#tippabgabeSpiele').length ? $('#tippabgabeSpiele') : root.find('table').first();
  if (!table.length) {
    throw new ParseError('Kicktipp bet form table not found', '#tippabgabeSpiele');
  }

  const matches: BetFormMatch[] = [];
  let lastKickoff: string | null = null;

  table.find('tr').each((_, element) => {
    const row = $(element);
    const homeInput = row.find('input[name*="heimTipp"], input[id$="_heimTipp"]').first();
    const awayInput = row.find('input[name*="gastTipp"], input[id$="_gastTipp"]').first();
    if (!homeInput.length || !awayInput.length) return;

    const cells = row.find('td');
    const cellTexts = cells.map((__, cell) => cleanText($(cell).text())).get();
    const kickoffCell = cellTexts.find(looksLikeKickoff);
    if (kickoffCell) lastKickoff = kickoffCell;

    const names = extractTeamNames(cellTexts);
    const homeName = names.home || cleanText(cells.eq(1).text());
    const awayName = names.away || cleanText(cells.eq(2).text());
    const inputRef = homeInput.attr('name') || homeInput.attr('id') || '';
    const formIndex = extractFormIndex(inputRef, matches.length);
    const homeValue = scoreInputValue(homeInput.attr('value'));
    const awayValue = scoreInputValue(awayInput.attr('value'));

    matches.push({
      formIndex,
      home: homeName,
      away: awayName,
      kickoff: lastKickoff,
      homeInputName: homeInput.attr('name') || '',
      awayInputName: awayInput.attr('name') || '',
      currentTip: homeValue == null || awayValue == null ? null : { home: homeValue, away: awayValue },
      locked: row.hasClass('nichttippbar') || row.find('.nichttippbar, input[disabled], input[readonly]').length > 0,
      odds: parseOdds(row.html() || ''),
    });
  });

  if (matches.length === 0) {
    throw new ParseError('Kicktipp bet form contains no editable score inputs', 'input[name*="heimTipp"]');
  }

  return { fields, matches };
}

function scoreInputValue(value: string | undefined): number | null {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractFormIndex(inputRef: string, fallback: number): number {
  const bracket = inputRef.match(/\[(\d+)]/);
  if (bracket) return Number(bracket[1]);
  const anyNumber = inputRef.match(/(\d+)/);
  return anyNumber ? Number(anyNumber[1]) : fallback;
}

function extractTeamNames(cellTexts: string[]): { home: string | null; away: string | null } {
  const candidates = cellTexts.filter((text) => {
    if (!text) return false;
    if (looksLikeKickoff(text)) return false;
    if (/^\d+$/.test(text)) return false;
    if (/^\d+\s*[:\-]\s*\d+$/.test(text)) return false;
    if (/^\d+(?:[,.]\d+)?\s+\d+(?:[,.]\d+)?\s+\d+(?:[,.]\d+)?$/.test(text)) return false;
    return /[A-Za-zÄÖÜäöüß]/.test(text);
  });
  return { home: candidates[0] || null, away: candidates[1] || null };
}
