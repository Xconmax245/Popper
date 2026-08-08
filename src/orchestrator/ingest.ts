/**
 * Paper ingestion — fetches source paper and extracts plain text.
 *
 * CRITICAL INVARIANT (bug fix): HTTP success != content success.
 * A 200 response from ar5iv can still be an abstract-only STUB page for very
 * recently submitted papers (LaTeXML conversion lags new submissions). We must
 * validate the *content* before handing it to the Extractor, otherwise the
 * Extractor honestly finds "no claims" in a fragment and the run silently
 * reports 0/0 as if the paper had no claims — when in fact we never delivered
 * the paper body at all.
 *
 * Fetch order: ar5iv HTML → validate → PDF fallback → validate → hard fail.
 * A hard fail throws IngestError, which the FSM routes to runs.state='error'
 * with a clearly-labeled message — NOT to the "no claims found" audit path.
 */

import { createClient } from '@/lib/supabase/server';
import {
  IngestError,
  validateExtractedContent,
  isListingUrl,
  extractArxivId,
  previewText,
  extractTextFromHtml,
} from './ingest-validate';

// Re-export so the FSM (and tests) can import from a single ingest entry point.
export {
  IngestError,
  validateExtractedContent,
  type IngestValidation,
} from './ingest-validate';

// Upper bound on the text we hand downstream, as a memory safety bound — NOT a
// functional truncation for normal papers. The previous value (30k) silently
// SEVERED the References/Bibliography section (which lives at the END of a
// multi-page paper): a 61k-char PDF was cut to 30k, dropping the bibliography,
// which made numbered citations like "[22]" unresolvable and forced every such
// claim to a false "unverifiable". We now (a) keep enough that a typical full
// paper passes through WHOLE, and (b) when a paper does exceed the bound, splice
// the References tail back on so it is never lost. The Extractor then does the
// final prompt-budget split (body + references) on text that still contains them.
const MAX_PAPER_CHARS = 120_000;

// How much of the References tail to guarantee we carry when a paper is too long
// to keep whole.
const REFS_TAIL_RESERVE = 15_000;

/**
 * Start index of the References/Bibliography section, or -1. Uses the LAST
 * heading-like match because those words also appear in prose earlier; the real
 * section sits at the end of the document.
 */
function findReferencesStart(text: string): number {
  const re = /(^|\n)[ \t]*(references|bibliography)[ \t]*(\n|:)/gi;
  let idx = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    idx = m.index + (m[1] ? m[1].length : 0);
  }
  return idx;
}

/**
 * Bound the text we hand downstream WITHOUT severing the bibliography. If the
 * whole paper fits under the cap we return it intact; otherwise we keep the head
 * AND splice the References tail back on, so numbered citations remain resolvable
 * by the Extractor and Verifier.
 */
function capPreservingReferences(text: string): string {
  if (text.length <= MAX_PAPER_CHARS) return text;

  const refIdx = findReferencesStart(text);
  // No refs heading, or it already falls within the kept head → plain cut is safe.
  if (refIdx === -1 || refIdx <= MAX_PAPER_CHARS - REFS_TAIL_RESERVE) {
    return text.slice(0, MAX_PAPER_CHARS);
  }

  const head = text.slice(0, MAX_PAPER_CHARS - REFS_TAIL_RESERVE);
  const refs = text.slice(refIdx, refIdx + REFS_TAIL_RESERVE);
  return `${head}\n\n===== REFERENCES / BIBLIOGRAPHY (spliced — body truncated to preserve citations) =====\n${refs}`;
}

// ============================================================
// STATE-EVENT LOGGING — writes to state_diffs (the execution trace)
// Kept local to ingest so every fetch attempt, preview, and validation verdict
// is visible in the Execution Trace pane, not just server logs.
// ============================================================
async function logStateEvent(
  runId: string,
  agentRole: string,
  fieldChanged: string,
  reason: string,
  values?: { old_value?: string | null; new_value?: string | null }
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from('state_diffs').insert({
      run_id: runId,
      claim_id: null,
      agent_role: agentRole,
      field_changed: fieldChanged,
      old_value: values?.old_value ?? null,
      new_value: values?.new_value ?? null,
      reason,
    });
  } catch {
    // Never let a trace-logging failure abort ingestion.
  }
}

/**
 * LOGGING REQUIREMENT (§3): log a content preview at the ingest step for EVERY
 * path attempted, regardless of whether validation passes. This single line is
 * what makes stub-page failures obvious at a glance in the trace.
 */
async function logPreview(runId: string, text: string, path: string): Promise<void> {
  await logStateEvent(
    runId,
    'orchestrator',
    'ingest_preview',
    `[${path}] Extracted ${text.length} chars. Preview: "${previewText(text)}..."`,
    { new_value: `${text.length} chars` }
  );
}

// ============================================================
// PUBLIC ENTRY POINT
// ============================================================
export async function ingestPaper(
  sourceUrl: string,
  runId: string
): Promise<{ text: string; source: string }> {
  // Reject listing/archive pages before attempting any fetch — this was a
  // previous bug (archive.math-ph URL). Keep this guard.
  if (isListingUrl(sourceUrl)) {
    throw new IngestError(
      'URL appears to be a category listing page, not a paper. Provide a direct /abs/ or /html/ link.'
    );
  }

  const arxivId = extractArxivId(sourceUrl);

  if (arxivId) {
    return ingestArxiv(arxivId, runId);
  }

  // Non-arXiv source: fetch generic HTML but apply the SAME validation gate.
  return ingestGenericHtml(sourceUrl, runId);
}

// ============================================================
// ARXIV: ar5iv HTML → validate → PDF fallback → validate → hard fail
// ============================================================
async function ingestArxiv(
  arxivId: string,
  runId: string
): Promise<{ text: string; source: string }> {
  // ---- Attempt 1: ar5iv HTML ----
  let ar5ivText = '';
  try {
    const html = await fetchHtml(`https://ar5iv.org/html/${arxivId}`);
    if (html) ar5ivText = extractTextFromHtml(html);
  } catch {
    // Leave ar5ivText empty — the validation gate below will flag it and we
    // fall through to the PDF path.
  }

  await logPreview(runId, ar5ivText, 'ar5iv_html');

  const ar5ivValidation = validateExtractedContent(ar5ivText);
  await logStateEvent(
    runId,
    'orchestrator',
    'ingest',
    `ar5iv_html attempt: ${ar5ivValidation.valid ? 'valid' : 'INVALID'} — ${
      ar5ivValidation.reason ?? `${ar5ivValidation.charCount} chars, structure OK`
    }`,
    { new_value: ar5ivValidation.valid ? 'valid' : 'invalid' }
  );

  if (ar5ivValidation.valid) {
    return { text: capPreservingReferences(ar5ivText), source: 'ar5iv_html' };
  }

  // ---- Attempt 2: PDF fallback ----
  await logStateEvent(
    runId,
    'orchestrator',
    'ingest',
    'ar5iv_html insufficient — falling back to PDF extraction'
  );

  let pdfText = '';
  try {
    pdfText = await fetchAndExtractPdf(`https://arxiv.org/pdf/${arxivId}`);
  } catch (err) {
    await logStateEvent(
      runId,
      'orchestrator',
      'ingest',
      `pdf_extract error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  await logPreview(runId, pdfText, 'pdf_extract');

  const pdfValidation = validateExtractedContent(pdfText);
  await logStateEvent(
    runId,
    'orchestrator',
    'ingest',
    `pdf_extract attempt: ${pdfValidation.valid ? 'valid' : 'INVALID'} — ${
      pdfValidation.reason ?? `${pdfValidation.charCount} chars, structure OK`
    }`,
    { new_value: pdfValidation.valid ? 'valid' : 'invalid' }
  );

  if (pdfValidation.valid) {
    return { text: capPreservingReferences(pdfText), source: 'pdf_extract' };
  }

  // ---- Both failed — hard stop. Do NOT proceed to extraction on bad content.
  // This is a bad-input case, not a graceful-degrade case.
  throw new IngestError(
    `Could not extract sufficient paper content from either ar5iv_html (${ar5ivValidation.charCount} chars) or PDF (${pdfValidation.charCount} chars). This paper may be too recent for HTML conversion, or the PDF may require OCR. Try a different paper.`
  );
}

// ============================================================
// GENERIC (non-arXiv) HTML — same validation gate applies
// ============================================================
async function ingestGenericHtml(
  sourceUrl: string,
  runId: string
): Promise<{ text: string; source: string }> {
  let text = '';
  try {
    const html = await fetchHtml(sourceUrl);
    if (html) text = extractTextFromHtml(html);
  } catch (err) {
    await logStateEvent(
      runId,
      'orchestrator',
      'ingest',
      `html error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  await logPreview(runId, text, 'html');

  const validation = validateExtractedContent(text);
  await logStateEvent(
    runId,
    'orchestrator',
    'ingest',
    `html attempt: ${validation.valid ? 'valid' : 'INVALID'} — ${
      validation.reason ?? `${validation.charCount} chars, structure OK`
    }`,
    { new_value: validation.valid ? 'valid' : 'invalid' }
  );

  if (validation.valid) {
    return { text: capPreservingReferences(text), source: 'html' };
  }

  throw new IngestError(
    `Could not extract sufficient paper content from ${sourceUrl} (${validation.charCount} chars). ${
      validation.reason ?? ''
    }`.trim()
  );
}

// ============================================================
// FETCH HELPERS
// ============================================================
async function fetchHtml(url: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Popper/1.0 (academic paper verifier; mailto:popper@example.com)',
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) return null;
  return await response.text();
}

/**
 * PDF extraction fallback (§2.3). PDF text is messier than HTML (broken
 * line-wrapping, garbled special chars, figures/tables as noise) — that's fine
 * for the Extractor, which pulls sentences rather than reproducing layout.
 *
 * We import pdf-parse's library entry point directly (`pdf-parse/lib/pdf-parse.js`)
 * to avoid the package's index.js debug block, which tries to read a bundled
 * test PDF when it thinks it's the main module (the classic pdf-parse+bundler
 * crash). It is also listed in next.config's serverComponentsExternalPackages.
 */
async function fetchAndExtractPdf(pdfUrl: string): Promise<string> {
  const response = await fetch(pdfUrl, {
    headers: {
      'User-Agent': 'Popper/1.0 (academic paper verifier; mailto:popper@example.com)',
      Accept: 'application/pdf',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`PDF fetch failed: HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  const mod = await import('pdf-parse/lib/pdf-parse.js');
  const pdfParse = (mod.default ?? mod) as (
    data: Buffer,
    options?: unknown
  ) => Promise<{ text: string }>;

  const data = await pdfParse(buffer);
  return data.text ?? '';
}
