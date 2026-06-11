import * as cheerio from 'cheerio';
import type { Community } from '../domain/types.js';
import { cleanText } from './text.js';

const RESERVED = new Set(['assets', 'info', 'manifest.json']);

export function parseCommunities(html: string): Community[] {
  const $ = cheerio.load(html);
  const communities = new Map<string, Community>();

  $('#kicktipp-content a[href^="/"], .pagecontent a[href^="/"]').each((_, element) => {
    const href = ($(element).attr('href') || '').replace(/^\/+|\/+$/g, '');
    if (!href || href.includes('/') || RESERVED.has(href)) return;
    const name = cleanText($(element).find('.menu-title-mit-tippglocke').text()) || cleanText($(element).text());
    if (!name) return;
    communities.set(href, { slug: href, name });
  });

  return [...communities.values()];
}
