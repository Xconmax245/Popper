/**
 * INGEST TEST HARNESS  (Testing Protocol §4)
 *
 * Run:  node --experimental-strip-types scripts/test-ingest.ts
 *       node --experimental-strip-types scripts/test-ingest.ts --offline   (skip network)
 *
 * This imports the REAL pure validators from src/orchestrator/ingest-validate.ts
 * (no duplication → no drift) and exercises:
 *
 *   OFFLINE (deterministic, gates the exit code):
 *     - stub/abstract-only text is REJECTED (the original bug)
 *     - a full paper body is ACCEPTED
 *     - long-but-structureless text is REJECTED (citation + section gates)
 *     - extractArxivId / isListingUrl guards behave
 *
 *   LIVE (best-effort, informational — never fails the suite on a network error):
 *     - old known-good paper (1706.03762) validates VALID via ar5iv
 *     - the failing paper (2608.05524) shows ar5iv INVALID → PDF fallback →
 *       either PDF valid OR a loud failure (both are correct; silent-empty is not)
 *     - a /archive/ listing URL is rejected by the guard before any fetch
 */

import {
  validateExtractedContent,
  extractArxivId,
  isListingUrl,
  extractTextFromHtml,
  MIN_CHARS,
} from '../src/orchestrator/ingest-validate.ts';

const OFFLINE = process.argv.includes('--offline');

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${name}`);
  } else {
    failed++;
    console.log(`  \u2717 ${name}${detail ? `  — ${detail}` : ''}`);
  }
}

// --- fixtures -------------------------------------------------------------

// The exact kind of stub the bug produced: title + abstract, then nothing.
const STUB =
  'We introduce a notion of completeness for two-dimensional conformal field ' +
  'theories and prove several structural results. Full text not yet available.';

function buildFullPaper(): string {
  const body = (
    'In this section we describe our approach and situate it against prior work. ' +
    'The method builds on established techniques and extends them substantially. '
  ).repeat(120); // ~28k chars of plausible body

  return [
    '1 Introduction',
    body,
    'We compare against the baseline of Smith et al. (2019) and report gains. ',
    'Further, the result in [1] and the analysis in [2] both support this view. ',
    '2 Methodology',
    body,
    '3 Conclusion',
    'We conclude with directions for future work. ',
    'References',
    '[1] A. Author, A study of things, Journal, 2019. ',
    '[2] B. Researcher, Another study, Proceedings, 2020. ',
  ].join('\n\n');
}

// >MIN_CHARS but no citations, no references, no section headers.
const LONG_NO_STRUCTURE = 'lorem ipsum dolor sit amet consectetur adipiscing elit '.repeat(300);

// >MIN_CHARS, HAS numbered citations, but NO section headers/references.
const LONG_CITED_NO_SECTIONS =
  'the quick brown fox jumps over the lazy dog [1] and again [2] '.repeat(300);

// --- OFFLINE UNIT TESTS ---------------------------------------------------

console.log(`\n\u2500\u2500 OFFLINE gate tests (MIN_CHARS=${MIN_CHARS}) \u2500\u2500`);

{
  const v = validateExtractedContent(STUB);
  check('stub/abstract-only text is REJECTED', !v.valid, `charCount=${v.charCount}`);
  check('  ...with a char-count reason', /min \d+/.test(v.reason ?? ''), v.reason);
}

{
  const full = buildFullPaper();
  const v = validateExtractedContent(full);
  check('full paper body is ACCEPTED', v.valid, v.reason ?? `charCount=${v.charCount}`);
  check('  ...and is well over MIN_CHARS', v.charCount > MIN_CHARS, `charCount=${v.charCount}`);
}

{
  const v = validateExtractedContent(LONG_NO_STRUCTURE);
  check('long but structureless text is REJECTED', !v.valid, v.reason);
  check('  ...for missing citations/references', /references\/citation/i.test(v.reason ?? ''), v.reason);
}

{
  const v = validateExtractedContent(LONG_CITED_NO_SECTIONS);
  check('long+cited but section-less text is REJECTED', !v.valid, v.reason);
  check('  ...for missing section structure', /section structure/i.test(v.reason ?? ''), v.reason);
}

console.log('\n\u2500\u2500 arXiv id / listing-guard tests \u2500\u2500');

check('extractArxivId(/abs/) works', extractArxivId('https://arxiv.org/abs/2608.05524') === '2608.05524');
check('extractArxivId(/pdf/) works', extractArxivId('https://arxiv.org/pdf/1706.03762') === '1706.03762');
check('extractArxivId keeps version', extractArxivId('https://arxiv.org/abs/2401.12345v2') === '2401.12345v2');
check('extractArxivId(ar5iv) works', extractArxivId('https://ar5iv.org/html/1706.03762') === '1706.03762');
check('extractArxivId(non-arxiv) is null', extractArxivId('https://example.com/paper') === null);

check('isListingUrl(/archive/) true', isListingUrl('https://arxiv.org/archive/math-ph'));
check('isListingUrl(/list/) true', isListingUrl('https://arxiv.org/list/hep-th/recent'));
check('isListingUrl(/abs/) false', !isListingUrl('https://arxiv.org/abs/2608.05524'));

// --- LIVE (best-effort) ---------------------------------------------------

async function fetchTextViaAr5iv(arxivId: string): Promise<string> {
  try {
    const res = await fetch(`https://ar5iv.org/html/${arxivId}`, {
      headers: { 'User-Agent': 'Popper/1.0 (test)', Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      console.log(`     ar5iv HTTP ${res.status}`);
      return '';
    }
    return extractTextFromHtml(await res.text());
  } catch (e) {
    console.log(`     ar5iv fetch error: ${(e as Error).message}`);
    return '';
  }
}

async function fetchTextViaPdf(arxivId: string): Promise<string> {
  try {
    const res = await fetch(`https://arxiv.org/pdf/${arxivId}`, {
      headers: { 'User-Agent': 'Popper/1.0 (test)', Accept: 'application/pdf' },
      redirect: 'follow',
      signal: AbortSignal.timeout(35_000),
    });
    if (!res.ok) {
      console.log(`     pdf HTTP ${res.status}`);
      return '';
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const mod = await import('pdf-parse/lib/pdf-parse.js');
    const pdfParse = (mod.default ?? mod) as (b: Buffer) => Promise<{ text: string }>;
    return (await pdfParse(buf)).text ?? '';
  } catch (e) {
    console.log(`     pdf extract error: ${(e as Error).message}`);
    return '';
  }
}

async function simulateIngest(label: string, arxivId: string): Promise<void> {
  console.log(`\n  [${label}] arXiv ${arxivId}`);
  const ar5iv = await fetchTextViaAr5iv(arxivId);
  const av = validateExtractedContent(ar5iv);
  console.log(
    `     ar5iv_html: ${av.valid ? 'VALID' : 'INVALID'} (${av.charCount} chars)` +
      (av.reason ? ` — ${av.reason}` : '')
  );
  if (av.valid) {
    console.log(`     \u2192 RESULT: would proceed to Extractor via ar5iv_html`);
    return;
  }
  console.log('     ar5iv insufficient — falling back to PDF...');
  const pdf = await fetchTextViaPdf(arxivId);
  const pv = validateExtractedContent(pdf);
  console.log(
    `     pdf_extract: ${pv.valid ? 'VALID' : 'INVALID'} (${pv.charCount} chars)` +
      (pv.reason ? ` — ${pv.reason}` : '')
  );
  if (pv.valid) {
    console.log(`     \u2192 RESULT: would proceed to Extractor via pdf_extract`);
  } else {
    console.log(
      `     \u2192 RESULT: IngestError (loud failure) — both sources invalid. ` +
        `This is CORRECT behavior (silent 0-claims is the only wrong outcome).`
    );
  }
}

async function runLive(): Promise<void> {
  console.log('\n\u2500\u2500 LIVE integration (best-effort; network required) \u2500\u2500');
  // §4.2 — old, known-good paper: expect ar5iv VALID
  await simulateIngest('OLD known-good', '1706.03762');
  // §4.3 — the failing paper: expect ar5iv INVALID → PDF fallback → valid or loud fail
  await simulateIngest('RECENT (bug report)', '2608.05524');
}

// --- run ------------------------------------------------------------------

async function main(): Promise<void> {
  if (!OFFLINE) {
    await runLive().catch((e) => console.log(`  (live tests skipped: ${(e as Error).message})`));
  } else {
    console.log('\n(--offline: skipping live network tests)');
  }

  console.log(`\n\u2500\u2500 SUMMARY \u2500\u2500`);
  console.log(`  offline gate tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('  RESULT: FAIL');
    process.exit(1);
  }
  console.log('  RESULT: PASS');
}

main();
