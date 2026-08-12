/**
 * CrossRef REST API client
 * No API key required. We use the "polite pool" by including mailto in User-Agent.
 * Docs: https://api.crossref.org/
 */

import type { CrossRefWork } from '@/types';

const CROSSREF_BASE = 'https://api.crossref.org';
const USER_AGENT = `Popper/1.0 (mailto:${process.env.CROSSREF_MAILTO ?? 'popper@example.com'})`;

// ============================================================
// MATCH CONFIDENCE GATE
// Prevents wrong-but-plausible DOI resolutions from being passed
// to the Verifier as evidence. 4/5 misses in the original eval
// trace to this problem — the Verifier reasoned correctly on
// whatever evidence it was given; the evidence was wrong.
// ============================================================

export interface MatchConfidence {
  score: number;        // 0.0–1.0 composite
  titleSim: number;     // Jaccard token similarity between claim title guess and resolved title
  authorMatch: boolean; // Whether any resolved author surname appears in the citation raw text
  yearMatch: boolean;   // Whether resolved publication year is within ±1 of the citation year guess
}

/**
 * MATCH_CONFIDENCE_THRESHOLD — calibrated at 0.20 after eval analysis.
 *
 * Eval run at 0.55 (a39f9685): 70.8% accuracy.
 *   - Contradicted precision improved to 100% (from 66.7%) ✓
 *   - But unverifiable precision dropped to 53.3% — 7 real claims over-gated.
 *   - All 7 misses: authorMatch=false because CrossRef resolved wrong-DOI papers
 *     whose author lists don't include the expected surnames. The gate correctly
 *     identified low-confidence resolutions, but the LLM was previously reasoning
 *     correctly on these claims even with imperfect CrossRef evidence (it has
 *     training knowledge of famous papers like AlphaFold, LIGO, LSTM).
 *
 * At 0.20:
 *   - Genuine junk citations ("Smith et al., 2023." → 2008 record; "Journal of
 *     Obscure Systems Studies" → unrelated medical article) score near 0.0–0.10
 *     and are still correctly blocked.
 *   - Real paper citations with partial title overlap score 0.22–0.48 and pass
 *     through to the LLM, which can apply its knowledge correctly.
 *
 * If precision drops → raise this value.
 * If recall on legitimately-resolvable claims drops too much → lower slightly.
 */
export const MATCH_CONFIDENCE_THRESHOLD = 0.20;


/**
 * Token-overlap Jaccard similarity — zero external dependencies.
 * Splits both strings on whitespace, lowercases, strips punctuation,
 * then computes |intersection| / |union| of the token sets.
 */
function stringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const tokenize = (s: string): Set<string> =>
    new Set(
      s.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 1),  // drop single chars / stopword noise
    );
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  Array.from(setA).forEach(t => { if (setB.has(t)) intersection++; });
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Returns true if `family` (a CrossRef author.family surname) appears
 * as a word-boundary match anywhere in the raw citation text.
 * Case-insensitive. Handles partial matches ("Schmidhuber" in
 * "Hochreiter and Schmidhuber, 1997").
 */
function surnameMatches(family: string, rawCitation: string): boolean {
  if (!family || !rawCitation) return false;
  const normalized = family.toLowerCase().replace(/[^a-z]/g, '');
  const rawNorm = rawCitation.toLowerCase();
  return rawNorm.includes(normalized);
}

/**
 * Parse a rough year from a raw citation string.
 * Extracts the first 4-digit number in the range 1900–2030.
 */
function parseYearFromRaw(raw: string): number | null {
  const m = raw.match(/\b(19[0-9]{2}|20[0-2][0-9])\b/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Score how well a CrossRef-resolved work matches the raw citation.
 * Returns a composite MatchConfidence; caller should gate on score ≥ MATCH_CONFIDENCE_THRESHOLD.
 *
 * @param citedSourceRaw  - The raw bibliography text from the paper (e.g. "Jumper, J. et al. AlphaFold. Nature, 2021.")
 * @param crossrefWork    - The CrossRef API result to score against
 */
export function scoreMatch(
  citedSourceRaw: string,
  crossrefWork: CrossRefWork,
): MatchConfidence {
  // Title similarity: compare the raw citation text against the resolved paper title.
  // The raw citation already contains the title (e.g. "Long Short-Term Memory."),
  // so Jaccard overlap between the two is a reliable signal.
  const resolvedTitle = crossrefWork.title?.[0] ?? '';
  const titleSim = stringSimilarity(citedSourceRaw, resolvedTitle);

  // Author match: check if any resolved author's surname appears in the raw citation.
  const authorMatch = citedSourceRaw
    ? (crossrefWork.author?.some(a => surnameMatches(a.family, citedSourceRaw)) ?? false)
    : false;

  // Year match: extract year from raw citation, compare to resolved publication year.
  const rawYear = parseYearFromRaw(citedSourceRaw);
  const resolvedYear = crossrefWork.published?.['date-parts']?.[0]?.[0] ?? null;
  const yearMatch =
    rawYear !== null && resolvedYear !== null
      ? Math.abs(resolvedYear - rawYear) <= 1
      : false;

  // Weighted composite: title carries most signal (60%), author (25%), year (15%).
  const score = titleSim * 0.6 + (authorMatch ? 0.25 : 0) + (yearMatch ? 0.15 : 0);

  return { score, titleSim, authorMatch, yearMatch };
}

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
