/**
 * INGEST — pure validation & parsing helpers.
 *
 * This module deliberately has ZERO external imports (no Supabase, no
 * pdf-parse, no next/*). Everything here is a pure string function so it can
 * be unit-tested in isolation and reused by both the runtime ingest path and
 * the offline test harness (scripts/test-ingest.js) with no risk of drift.
 *
 * The core insight of the bug fix lives here: HTTP success != content success.
 * `validateExtractedContent` is the gate that distinguishes a real full-text
 * paper body from an abstract-only stub page (which ar5iv/LaTeXML can return
 * with HTTP 200 for very recently submitted papers).
 */

export interface IngestValidation {
  valid: boolean;
  reason?: string;
  charCount: number;
}

/**
 * Thrown when we cannot retrieve/validate the paper's full-text body from any
 * source. This is a HARD STOP — an FSM run on invalid input is a bad-input
 * case, not a graceful-degrade case. The FSM catches this and writes
 * runs.state = 'error' with a clearly-labeled message, so it is never conflated
 * with the legitimate "paper had no checkable claims" finding.
 */
export class IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IngestError';
  }
}

// Threshold: a real paper body is virtually never under this. Most
// single-paragraph abstracts + metadata land well under 8000 chars.
export const MIN_CHARS = 8000;

/**
 * Content validation gate. Runs AFTER a successful fetch, BEFORE the content is
 * handed to the Extractor. Returns valid=false with a human-readable reason if
 * the text looks like a stub/abstract-only page or a malformed extraction.
 */
export function validateExtractedContent(text: string): IngestValidation {
  const charCount = text.length;

  // Structural markers real paper bodies almost always contain.
  // Absence of ALL of these is a strong stub-page signal.
  const hasReferencesSection = /references|bibliography/i.test(text);
  const hasNumberedCitations =
    /\[\d+\]/.test(text) || /\(\w+(\s+et al\.?)?,?\s+\d{4}\)/.test(text);
  const hasSectionHeaders =
    /introduction|methodology|related work|conclusion/i.test(text);

  if (charCount < MIN_CHARS) {
    return {
      valid: false,
      reason: `Only ${charCount} chars extracted (min ${MIN_CHARS}) — likely a stub/abstract-only page, not full paper body`,
      charCount,
    };
  }
  if (!hasReferencesSection && !hasNumberedCitations) {
    return {
      valid: false,
      reason: `No references/citation markers found in ${charCount} chars — content does not resemble a full paper body`,
      charCount,
    };
  }
  if (!hasSectionHeaders) {
    return {
      valid: false,
      reason: `No recognizable section structure found — content may be a stub or malformed extraction`,
      charCount,
    };
  }

  return { valid: true, charCount };
}

/**
 * A category listing / archive page is not a paper. Reject before any fetch.
 * (This was a previous bug — an archive.math-ph listing URL was accepted.)
 */
export function isListingUrl(sourceUrl: string): boolean {
  return /\/archive\/|\/list\//.test(sourceUrl);
}

/**
 * Extract a modern arXiv identifier (e.g. "2608.05524" or "2401.12345v2")
 * from an arxiv.org / ar5iv URL. Returns null if none is found (caller then
 * falls back to generic HTML handling).
 */
export function extractArxivId(sourceUrl: string): string | null {
  const pathMatch = sourceUrl.match(
    /(?:arxiv\.org|ar5iv\.org|ar5iv\.labs\.arxiv\.org)\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})(v\d+)?/i
  );
  if (pathMatch) return pathMatch[1] + (pathMatch[2] ?? '');

  // Bare id fallback (e.g. a raw "2608.05524" pasted in).
  const bare = sourceUrl.match(/(\d{4}\.\d{4,5})(v\d+)?/);
  return bare ? bare[1] + (bare[2] ?? '') : null;
}

/** First ~n chars with whitespace collapsed — for the execution-trace preview. */
export function previewText(text: string, n = 300): string {
  return text.slice(0, n).replace(/\s+/g, ' ');
}

/**
 * Convert an HTML document to plain-ish text. Strips scripts/styles/nav,
 * preserves paragraph/heading breaks, decodes common entities. Pure string ops.
 */
export function extractTextFromHtml(html: string): string {
  // Remove scripts, styles, SVG, nav elements
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');

  // Preserve paragraph breaks
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Clean up whitespace and decode common entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{3,}/g, '\n\n')
    .trim();

  return text;
}
