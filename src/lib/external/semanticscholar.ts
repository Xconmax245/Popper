/**
 * Semantic Scholar Academic Graph API client
 * Free tier: 100 req/5min without key. Key: 1 req/sec, no meaningful daily ceiling.
 * Docs: https://api.semanticscholar.org/graph/v1
 *
 * KEY DESIGN: Use batch POST to fetch all papers in ONE call per run.
 * This is the single highest-leverage move for staying under request quota.
 * Individual per-claim calls are the fallback only.
 */

import type { SemanticScholarPaper } from '@/types';

const SS_BASE = 'https://api.semanticscholar.org/graph/v1';
const SS_KEY = process.env.SEMANTIC_SCHOLAR_API_KEY;

const FIELDS = 'title,abstract,year,venue,externalIds,url';

function getHeaders(): HeadersInit {
  const h: HeadersInit = { 'Content-Type': 'application/json' };
  if (SS_KEY) h['x-api-key'] = SS_KEY;
  return h;
}

/**
 * BATCH LOOKUP — fetch all papers in one call per run.
 * Input: array of DOIs (from CrossRef resolution). Returns a Map<doi, paper>.
 * Papers not found in S2 are absent from the map.
 */
export async function batchFetchByDois(dois: string[]): Promise<Map<string, SemanticScholarPaper>> {
  const result = new Map<string, SemanticScholarPaper>();
  if (dois.length === 0) return result;

  try {
    const response = await fetch(`${SS_BASE}/paper/batch`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        ids: dois.map(doi => `DOI:${doi.replace(/^https?:\/\/doi\.org\//, '')}`),
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) return result;

    const papers: (SemanticScholarPaper | null)[] = await response.json();
    for (let i = 0; i < dois.length; i++) {
      const paper = papers[i];
      if (paper) result.set(dois[i], paper);
    }
  } catch {
    // Return what we have
  }

  return result;
}

/**
 * Individual lookup by DOI — fallback for when batch isn't available
 */
export async function getPaperByDoi(doi: string): Promise<SemanticScholarPaper | null> {
  try {
    const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//, '');
    const url = `${SS_BASE}/paper/DOI:${encodeURIComponent(cleanDoi)}?fields=${FIELDS}`;

    const response = await fetch(url, {
      headers: getHeaders(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Search by title — fallback for claims where CrossRef didn't resolve a DOI
 */
export async function searchByTitle(title: string): Promise<SemanticScholarPaper | null> {
  try {
    const url = new URL(`${SS_BASE}/paper/search/match`);
    url.searchParams.set('query', title);
    url.searchParams.set('fields', FIELDS);

    const response = await fetch(url.toString(), {
      headers: getHeaders(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data?.data?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Agreement check: if both CrossRef and S2 resolve the same DOI for a citation,
 * we flag it as higher-confidence evidence. If they disagree, flag it as a note
 * for the Verifier's reasoning context.
 */
export function checkSourceAgreement(
  crossrefDoi: string | null,
  ssPaper: SemanticScholarPaper | null
): { agrees: boolean; note: string } {
  if (!crossrefDoi || !ssPaper) {
    return { agrees: false, note: 'One or both sources failed to resolve the citation.' };
  }
  const ssDoi = ssPaper.externalIds?.DOI;
  if (!ssDoi) {
    return { agrees: false, note: 'Semantic Scholar found the paper but has no DOI — cannot cross-verify.' };
  }
  const normalize = (d: string) => d.toLowerCase().replace(/^https?:\/\/doi\.org\//, '');
  const agrees = normalize(crossrefDoi) === normalize(ssDoi);
  return {
    agrees,
    note: agrees
      ? 'CrossRef and Semantic Scholar agree on the DOI — higher confidence.'
      : `DOI mismatch: CrossRef=${crossrefDoi}, S2=${ssDoi} — treat as flag.`,
  };
}
