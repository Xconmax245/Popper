/**
 * measure-llm.ts — how DEFAULT_LLM_TIMEOUT_MS was chosen (not guessed).
 *
 * Referenced by src/lib/llm/call.ts. Run it to (re)derive the timeout:
 *
 *   npx tsx scripts/measure-llm.ts
 *   # or, if you prefer node's env loader:
 *   #   node --env-file=.env.local --loader tsx scripts/measure-llm.ts
 *
 * It does two things:
 *   PHASE A — issues ONE representative extractor-sized call (same model,
 *             same provider preferences, ~12k-char prompt) and measures the
 *             real end-to-end latency. Recommended timeout = ceil(2.5x) to the
 *             next 5s, floored at 30s. This is the number baked into
 *             DEFAULT_LLM_TIMEOUT_MS (45_000ms), overridable via LLM_TIMEOUT_MS.
 *
 *   PHASE B — re-issues the same call with a deliberately tiny (1ms) deadline to
 *             prove the AbortController path fires and is classified as a
 *             timeout, NOT a generic failure — i.e. the exact mechanism that
 *             turns a silent hang into a visible `timed_out` trace event.
 *
 * Standalone on purpose: no app imports, no Supabase, no path aliases — just
 * global fetch (Node 18+). Reads OPENROUTER_API_KEY from the environment.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.MODEL_EXTRACTOR ?? 'openai/gpt-oss-20b:free';

// Mirror the production provider routing exactly so the measurement is faithful.
const PROVIDER_PREFERENCES = {
  sort: 'price',
  max_price: { prompt: 0, completion: 0 },
  allow_fallbacks: true,
  data_collection: 'deny',
} as const;

const SYSTEM_PROMPT =
  'You extract citation-backed factual claims from research papers. Return a JSON array of claim objects. Be thorough.';

// Build a ~12k-char user prompt that resembles a real extractor workload without
// shipping a giant string literal in this file.
function buildRepresentativePrompt(): string {
  const paragraph =
    'In this section we evaluate the proposed method against strong baselines on ' +
    'three benchmark datasets, reporting mean accuracy over five seeds. Prior work ' +
    '[12] established that the effect persists under distribution shift, and we ' +
    'confirm a 3.4-point improvement (p < 0.01) relative to the baseline of Smith ' +
    'et al. (2021). See Table 2 for the full ablation. ';
  let body = '';
  while (body.length < 12_000) body += paragraph;
  return `Extract every citation-backed claim from the following paper body:\n\n${body}`;
}

interface PhaseAResult {
  latencyMs: number;
  httpStatus: number;
  ok: boolean;
}

async function phaseAMeasure(userPrompt: string): Promise<PhaseAResult> {
  const start = Date.now();
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/popper-verify/popper',
      'X-Title': 'Popper - LLM latency measurement',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 2048,
      provider: PROVIDER_PREFERENCES,
    }),
  });
  const latencyMs = Date.now() - start;
  // Drain the body so the socket closes cleanly and the timing is honest.
  await res.text().catch(() => '');
  return { latencyMs, httpStatus: res.status, ok: res.ok };
}

/** Returns true iff the abort fired and was recognized as an AbortError. */
async function phaseBProveAbort(userPrompt: string): Promise<{ aborted: boolean; elapsedMs: number; kind: string }> {
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), 1); // 1ms — guaranteed to trip
  const start = Date.now();
  try {
    await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        provider: PROVIDER_PREFERENCES,
      }),
      signal: controller.signal,
    });
    clearTimeout(handle);
    return { aborted: false, elapsedMs: Date.now() - start, kind: 'completed-before-abort(unexpected)' };
  } catch (err: unknown) {
    clearTimeout(handle);
    const name = err instanceof Error ? err.name : String(err);
    // This is exactly how call.ts distinguishes timed_out from failed.
    const isAbort = name === 'AbortError' || (err instanceof Error && err.name === 'AbortError');
    return { aborted: isAbort, elapsedMs: Date.now() - start, kind: name };
  }
}

function recommendTimeoutMs(latencyMs: number): number {
  const raw = latencyMs * 2.5;
  const roundedTo5s = Math.ceil(raw / 5_000) * 5_000;
  return Math.max(30_000, roundedTo5s);
}

async function main(): Promise<void> {
  if (!KEY) {
    console.error('OPENROUTER_API_KEY is not set. Provide it via .env.local or the environment and re-run.');
    process.exit(1);
    return;
  }

  const userPrompt = buildRepresentativePrompt();
  console.log(`\n=== Popper LLM timeout measurement ===`);
  console.log(`model: ${MODEL}`);
  console.log(`prompt size: ${userPrompt.length} chars (representative extractor workload)\n`);

  // PHASE A — real latency
  console.log('PHASE A: measuring one normal successful-call latency…');
  try {
    const a = await phaseAMeasure(userPrompt);
    const rec = recommendTimeoutMs(a.latencyMs);
    console.log(`  HTTP ${a.httpStatus} (ok=${a.ok}) in ${a.latencyMs}ms`);
    console.log(`  recommended DEFAULT_LLM_TIMEOUT_MS ≈ ${rec}ms  (ceil(2.5 x ${a.latencyMs}ms) → next 5s, floor 30s)`);
    console.log(`  current shipped default: 45000ms (env override: LLM_TIMEOUT_MS)\n`);
  } catch (err) {
    console.log(`  PHASE A errored: ${err instanceof Error ? err.message : String(err)}`);
    console.log('  (network/tier issue — the 45000ms default remains a safe, generous floor)\n');
  }

  // PHASE B — prove the abort → timed_out mechanism deterministically
  console.log('PHASE B: proving the AbortController deadline fires (1ms timeout)…');
  const b = await phaseBProveAbort(userPrompt);
  console.log(`  aborted=${b.aborted} kind=${b.kind} after ${b.elapsedMs}ms`);
  if (b.aborted) {
    console.log('  ✔ Abort fired and was recognized as AbortError → call.ts logs this as `timed_out`, not a silent hang.\n');
  } else {
    console.log('  ✖ Abort did NOT classify as AbortError — investigate before trusting the timeout path.\n');
    process.exitCode = 2;
  }
}

void main();

export {};
