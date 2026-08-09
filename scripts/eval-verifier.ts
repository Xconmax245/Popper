/**
 * scripts/eval-verifier.ts — FROZEN Verifier accuracy evaluation.
 *
 * Runs the PRODUCTION Verifier (src/agents/verifier.ts → runVerifier) against a
 * small, curated, frozen claim set (eval/claims.json) and prints a scorecard:
 * overall accuracy, per-class precision/recall, a confusion matrix, and the list
 * of misses. Results are frozen to eval/results.json.
 *
 * This is the SAME code path as a real run — NOT a toy re-implementation:
 *   1. Insert a throwaway run + the eval claims into the real DB (service role).
 *   2. Call runVerifier({ runId, claimIds }) — the exact production function
 *      (CrossRef + Semantic Scholar resolution in TypeScript, then ONE
 *      gpt-oss-20b LLM call per claim, using the production prompt, schema,
 *      budget enforcement and trace logging).
 *   3. Read the verdicts back from the claims table and score them against the
 *      expected labels.
 *
 * Run:
 *   npx tsx scripts/eval-verifier.ts
 *
 * Env: .env.local is loaded automatically. LLM_TIMEOUT_MS is deliberately NOT
 * imported from it, so a dev-shell override (e.g. =1) can't skew the eval — the
 * production default (45s) is always used.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

// ---- Load .env.local BEFORE importing any app module. call.ts reads
//      OPENROUTER_API_KEY at module-load time, so env must be set first; that is
//      why the app modules below are imported DYNAMICALLY, after this runs. ----
function loadEnvLocal(): void {
  let raw = '';
  try {
    raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1];
    if (key === 'LLM_TIMEOUT_MS') continue; // force the production default
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvLocal();

type Status = 'confirmed' | 'contradicted' | 'unverifiable';
const CLASSES: Status[] = ['confirmed', 'contradicted', 'unverifiable'];

interface EvalClaim {
  id: string;
  claim_text: string;
  source_sentence: string;
  cited_source_raw: string | null;
  expected_status: Status;
  notes?: string;
}

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

async function main(): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY missing (set it in .env.local). Aborting.');
    process.exit(1);
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Supabase env missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). Aborting.');
    process.exit(1);
  }

  // Dynamic imports AFTER env load so module-load-time env reads succeed.
  const { createClient } = await import('../src/lib/supabase/server');
  const { runVerifier } = await import('../src/agents/verifier');

  const claims: EvalClaim[] = JSON.parse(readFileSync(join(ROOT, 'eval', 'claims.json'), 'utf8'));
  const expectedCounts = CLASSES.map((c) => `${claims.filter((x) => x.expected_status === c).length} ${c}`).join(' / ');
  console.log(`Loaded ${claims.length} eval claims (${expectedCounts}).`);

  const supabase = await createClient();

  // ---- Throwaway run (budget high enough to verify every claim) ----
  const { data: run, error: runErr } = await supabase
    .from('runs')
    .insert({ source_url: 'eval://verifier-accuracy', request_budget: Math.max(60, claims.length * 2) })
    .select()
    .single();
  if (runErr || !run) {
    console.error('Failed to create eval run:', runErr?.message ?? 'unknown');
    process.exit(1);
  }
  const runId: string = run.id;
  console.log(`Created eval run ${runId}`);

  // ---- Insert claims one-by-one to keep an exact eval-id -> claim-id mapping ----
  const map: { evalId: string; claimId: string; expected: Status; text: string }[] = [];
  for (const c of claims) {
    const { data: inserted, error: insErr } = await supabase
      .from('claims')
      .insert({
        run_id: runId,
        source_sentence: c.source_sentence,
        paraphrased_claim: c.claim_text,
        cited_source_raw: c.cited_source_raw,
      })
      .select()
      .single();
    if (insErr || !inserted) {
      console.error(`  ! failed to insert ${c.id}: ${insErr?.message ?? 'unknown'}`);
      continue;
    }
    map.push({ evalId: c.id, claimId: inserted.id, expected: c.expected_status, text: c.claim_text });
  }
  console.log(`Inserted ${map.length}/${claims.length} claims. Running the PRODUCTION Verifier…\n`);

  // ---- Run the REAL verifier (this makes the live LLM + CrossRef + S2 calls) ----
  const started = Date.now();
  try {
    await runVerifier({ runId, claimIds: map.map((m) => m.claimId) });
  } catch (e) {
    console.error('runVerifier threw (partial results will still be scored):', e instanceof Error ? e.message : String(e));
  }
  const elapsedMs = Date.now() - started;

  // ---- Read verdicts back ----
  const { data: verified } = await supabase
    .from('claims')
    .select('id,status,status_reason,confidence,cited_source_doi')
    .in('id', map.map((m) => m.claimId));
  const byId = new Map((verified ?? []).map((v: { id: string } & Record<string, unknown>) => [v.id, v]));

  const results = map.map((m) => {
    const v = byId.get(m.claimId) as
      | { status?: string; status_reason?: string; confidence?: number | null; cited_source_doi?: string | null }
      | undefined;
    const predicted = (v?.status ?? 'unverifiable') as Status;
    return {
      id: m.evalId,
      claim: m.text,
      expected: m.expected,
      predicted,
      correct: predicted === m.expected,
      reason: v?.status_reason ?? '(no verdict written)',
      confidence: v?.confidence ?? null,
      resolved_doi: v?.cited_source_doi ?? null,
    };
  });

  const total = results.length;
  const correct = results.filter((r) => r.correct).length;
  const overall = total ? correct / total : 0;

  // Confusion matrix [expected][predicted]
  const cm: Record<Status, Record<Status, number>> = {
    confirmed: { confirmed: 0, contradicted: 0, unverifiable: 0 },
    contradicted: { confirmed: 0, contradicted: 0, unverifiable: 0 },
    unverifiable: { confirmed: 0, contradicted: 0, unverifiable: 0 },
  };
  for (const r of results) cm[r.expected][r.predicted]++;

  // Per-class precision/recall
  const perClass = {} as Record<
    Status,
    { precision: number; recall: number; tp: number; fp: number; fn: number; support: number }
  >;
  for (const cls of CLASSES) {
    const tp = cm[cls][cls];
    let fp = 0;
    let fn = 0;
    for (const other of CLASSES) {
      if (other === cls) continue;
      fp += cm[other][cls]; // predicted cls but expected other
      fn += cm[cls][other]; // expected cls but predicted other
    }
    const support = CLASSES.reduce((s, p) => s + cm[cls][p], 0);
    perClass[cls] = {
      tp,
      fp,
      fn,
      support,
      precision: tp + fp ? tp / (tp + fp) : 0,
      recall: tp + fn ? tp / (tp + fn) : 0,
    };
  }

  // ---- Print scorecard ----
  console.log('==================== VERIFIER EVALUATION ====================');
  console.log(`Claims: ${total}   Correct: ${correct}   Overall accuracy: ${pct(overall)}`);
  console.log(`Verifier wall-clock: ${(elapsedMs / 1000).toFixed(1)}s   Run: ${runId}\n`);

  console.log('Per-class:');
  for (const cls of CLASSES) {
    const p = perClass[cls];
    console.log(
      `  ${cls.padEnd(13)} support=${p.support}  precision=${pct(p.precision)}  recall=${pct(p.recall)}  (tp=${p.tp} fp=${p.fp} fn=${p.fn})`,
    );
  }

  console.log('\nConfusion matrix (rows = expected, cols = predicted):');
  console.log(`  ${''.padEnd(14)}${CLASSES.map((c) => c.slice(0, 8).padStart(10)).join('')}`);
  for (const exp of CLASSES) {
    console.log(`  ${exp.padEnd(14)}${CLASSES.map((p) => String(cm[exp][p]).padStart(10)).join('')}`);
  }

  const misses = results.filter((r) => !r.correct);
  console.log(`\nMisses (${misses.length}):`);
  for (const mi of misses) {
    console.log(`  ${mi.id}: expected ${mi.expected}, got ${mi.predicted} — ${String(mi.reason).slice(0, 140)}`);
  }
  console.log('=============================================================\n');

  // ---- Freeze results ----
  const out = {
    generated_at: new Date().toISOString(),
    run_id: runId,
    model_verifier: process.env.MODEL_VERIFIER ?? 'openai/gpt-oss-20b:free',
    verifier_wall_clock_s: Number((elapsedMs / 1000).toFixed(1)),
    totals: { total, correct, overall_accuracy: Number(overall.toFixed(4)) },
    per_class: perClass,
    confusion_matrix: cm,
    results,
  };
  writeFileSync(join(ROOT, 'eval', 'results.json'), JSON.stringify(out, null, 2), 'utf8');
  console.log(`Wrote eval/results.json. Eval run kept in DB for inspection: ${runId}`);
}

void main().catch((e) => {
  console.error('eval-verifier fatal:', e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});

export {};
