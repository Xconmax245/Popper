/**
 * CrossRef REST API client
 * No API key required. We use the "polite pool" by including mailto in User-Agent.
 * Docs: https://api.crossref.org/
 */

import type { CrossRefWork } from '@/types';

const CROSSREF_BASE = 'https://api.crossref.org';
const USER_AGENT = `Popper/1.0 (mailto:${process.env.CROSSREF_MAILTO ?? 'popper@example.com'})`;

// Resolve a raw citation string to a DOI and metadata
export async function resolveCitation(citationRaw: string): Promise<CrossRefWork | null> {
  try {
    const url = new URL(`${CROSSREF_BASE}/works`);
    url.searchParams.set('query.bibliographic', citationRaw);
    url.searchParams.set('rows', '1');
    url.searchParams.set('select', 'DOI,title,abstract,author,published,URL,publisher,container-title');

    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const items: CrossRefWork[] = data?.message?.items ?? [];
    return items[0] ?? null;
  } catch {
    return null;
  }
}

// Fetch a work by exact DOI
export async function getWorkByDoi(doi: string): Promise<CrossRefWork | null> {
  try {
    const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//, '');
    const url = `${CROSSREF_BASE}/works/${encodeURIComponent(cleanDoi)}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data?.message ?? null;
  } catch {
    return null;
  }
}

// Extract abstract text, handling <jats:p> XML tags CrossRef sometimes returns
export function extractAbstract(work: CrossRefWork): string {
  const raw = work.abstract ?? '';
  // Strip JATS XML tags
  return raw.replace(/<[^>]+>/g, '').trim();
}

// Format authors for display
export function formatAuthors(work: CrossRefWork): string {
  if (!work.author || work.author.length === 0) return 'Unknown authors';
  return work.author.slice(0, 3).map(a => `${a.given} ${a.family}`).join(', ')
    + (work.author.length > 3 ? ' et al.' : '');
}

// Extract publication year
export function extractYear(work: CrossRefWork): number | null {
  return work.published?.['date-parts']?.[0]?.[0] ?? null;
}
