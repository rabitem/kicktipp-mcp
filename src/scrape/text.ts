export function cleanText(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseGermanNumber(value: string): number | null {
  const normalized = value.trim().replace('%', '').replace(',', '.');
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseScoreText(value: string): { home: number; away: number } | null {
  const match = value.match(/(\d+)\s*[:\-]\s*(\d+)/);
  if (!match) return null;
  return { home: Number(match[1]), away: Number(match[2]) };
}

export function looksLikeKickoff(value: string): boolean {
  return /\b\d{2}\.\d{2}\.\d{2,4}(?:\s+\d{1,2}:\d{2})?\b/.test(value);
}
