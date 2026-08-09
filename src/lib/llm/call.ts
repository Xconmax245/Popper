/**
 * SHARED LLM CALL WRAPPER
 *
 * Every LLM request in Popper (Extractor, Verifier, Synthesis, Audit summary)
 * routes through this ONE function. No agent hand-rolls its own fetch anymore —
 * that is how you end up with four different places to apply a fix like this.
 *
 * WHY THIS EXISTS (bug fix):
 * The previous `callLLM` in openrouter.ts issued `fetch()` with NO AbortController
 * and NO timeout. When a free-tier provider accepted the connection but never
 * returned a body, that `await fetch(...)` NEVER SETTLED — it neither resolved
 * nor rejected. The FSM's try/catch cannot catch a promise that never rejects,
 * so the run sat in `extract → extract` forever with zero requests logged, zero
 * cost, and zero trace signal. This wrapper makes that failure mode IMPOSSIBLE:
 *
 *   1. A guaranteed timeout (AbortController) means the call ALWAYS settles.
 *   2. A `dispatched` trace event fires unconditionally the instant the request
 *      leaves — so "did the request even go out?" is never a mystery again.
 *   3. Every call resolves to exactly one terminal trace event: `parsed`
 *      (success), `failed`, or `timed_out`. No code path can leave a call's
 *      outcome unlogged.
 *
 * The five states an LLM call can be in (§2 of the directive), each traced:
 *   dispatched → responded → parsed        (happy path)
 *                         ↘ failed          (non-OK / malformed / schema mismatch)
 *              ↘ timed_out                  (no response within the deadline)
 *   budget_halted                          (blocked before dispatch)
 */

import type { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { checkBudget, applyBudgetStatus } from '@/lib/openrouter';
import { extractJson } from '@/lib/parse';
import { MODEL_LIST_PRICES } from '@/types';

// ============================================================
// PUBLIC TYPES
// ============================================================

/**
 * Logical agent role at the call site. NOTE: 'audit' is a logical role only —
 * the state_diffs.agent_role CHECK constraint does not permit it, so it is
 * mapped to 'orchestrator' for DB writes (see dbAgentRole). This matches the
 * pre-existing convention (audit.ts already logged its summary call as
 * 'orchestrator').
 */
export type LlmAgentRole = 'extractor' | 'verifier' | 'synthesis' | 'audit';

export interface LlmCallParams<T = unknown> {
  runId: string;
  agentRole: LlmAgentRole;
  claimId?: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  /** If provided, the response is JSON-extracted and validated against this schema. */
  responseSchema?: z.ZodType<T>;
  /** Total-response deadline. Defaults to LLM_TIMEOUT_MS env or DEFAULT_LLM_TIMEOUT_MS. */
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
  /**
   * Optional OpenRouter reasoning controls. Reasoning models (e.g. gpt-oss-20b)
   * can spend the ENTIRE max_tokens budget on chain-of-thought before emitting
   * any answer, producing empty or truncated JSON. Pass e.g.
   * { effort: 'low', exclude: true } to cap reasoning and keep it out of the
   * content field so the JSON parser sees clean output.
   */
  reasoning?: {
    effort?: 'low' | 'medium' | 'high';
    max_tokens?: number;
    exclude?: boolean;
    enabled?: boolean;
  };
  /**
   * Internal retry counter (1-based). Do NOT set at call sites — callLlm manages
   * it itself when retrying transient provider failures (429/5xx) with backoff.
   */
  _attempt?: number;
}


export interface LlmCallResult<T> {
  success: boolean;
  data?: T;
  rawText?: string;
  error?: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

/**
 * Thrown by an agent when a callLlm result is a HARD failure that must abort the
 * run (e.g. the Extractor could not produce claims because the call itself
 * failed — which must NOT be silently reclassified as "paper has no claims").
 * The FSM catches this and routes to a distinct, clearly-labeled error state.
 */
export class LlmCallError extends Error {
  readonly agentRole: LlmAgentRole;
  readonly claimId?: string;
  constructor(agentRole: LlmAgentRole, message: string, claimId?: string) {
    super(message);
    this.name = 'LlmCallError';
    this.agentRole = agentRole;
    this.claimId = claimId;
  }
}

// ============================================================
// CONFIG
// ============================================================

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

/**
 * Transient provider failures are RETRYABLE. The free tier in particular returns
 * 429 under bursty load (e.g. verifying 20+ claims back-to-back); without retries
 * those claims collapse to a false "unverifiable" — an infrastructure artifact,
 * not a real verdict. Bounded exponential backoff (honoring Retry-After when the
 * provider sends it) keeps a temporary 429/5xx from poisoning the Claim Graph.
 * Override the attempt cap with LLM_MAX_ATTEMPTS.
 */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529]);
const LLM_MAX_ATTEMPTS = Math.max(1, Number(process.env.LLM_MAX_ATTEMPTS ?? 3));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Default total-response timeout. Free-tier inference on a shared pool is slower
 * and more variable than paid tiers, and a 20B model chewing a large prompt is a
 * real workload — so this is deliberately generous. Override per-deploy with
 * LLM_TIMEOUT_MS. See scripts/measure-llm.ts for how this number was chosen
 * (roughly 2.5x an observed normal successful-call latency).
 */
export const DEFAULT_LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 45_000);

/**
 * Provider routing preferences. IMPORTANT: `sort` MUST be a string and
 * `max_price` MUST cap at 0 — this is the proven, working config from the
 * original client. Do NOT "simplify" to `sort: null`: that returns HTTP 400 and
 * removing the price cap risks routing to a paid model.
 */
const PROVIDER_PREFERENCES = {
  sort: 'price',
  max_price: { prompt: 0, completion: 0 },
  allow_fallbacks: true,
  data_collection: 'deny',
} as const;

// ============================================================
// TRACE + LEDGER LOGGING (self-contained, DB-constraint-safe)
// ============================================================

/**
 * state_diffs.agent_role CHECK is IN ('extractor','verifier','synthesis',
 * 'orchestrator','trigger'). 'audit' is not allowed, so map it to
 * 'orchestrator' for any DB write. Applied to agent_calls too so the client-side
 * AgentRole zod enum can still parse those rows.
 */
function dbAgentRole(role: LlmAgentRole): 'extractor' | 'verifier' | 'synthesis' | 'orchestrator' {
  return role === 'audit' ? 'orchestrator' : role;
}

export type LlmTraceState =
  | 'dispatched'
  | 'responded'
  | 'parsed'
  | 'failed'
  | 'timed_out'
  | 'budget_halted';

/**
 * Write one execution-trace event. Never throws — a trace-logging failure must
 * not itself become a new way for the pipeline to break.
 */
async function logLlmEvent(
  runId: string,
  agentRole: LlmAgentRole,
  claimId: string | undefined,
  state: LlmTraceState,
  reason: string,
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from('state_diffs').insert({
      run_id: runId,
      claim_id: claimId ?? null,
      agent_role: dbAgentRole(agentRole),
      field_changed: state,
      old_value: null,
      new_value: null,
      reason,
    });
  } catch {
    // swallow — logging must never abort a call
  }
}

/**
 * Record the call in the cost ledger (agent_calls). agent_calls has NO `status`
 * column, so failed/timed-out calls are logged here as 0-token/0-cost rows for
 * visibility and latency, while their outcome is conveyed by the state_diffs
 * event above.
 *
 * BUDGET ACCOUNTING (countedAgainstBudget): increment requests_used for ANY
 * request that was actually dispatched to the provider — success, non-OK HTTP,
 * OR client-side timeout — because each of those consumed a real slot against
 * OpenRouter's per-minute/per-day rate caps (the connection was accepted on
 * their end). Only calls blocked BEFORE dispatch (budget_halted, missing API
 * key) skip the increment. Under-counting here would let a run silently blow the
 * real rate limit while our own ledger still showed headroom — the more
 * dangerous direction — so we err toward counting.
 */
async function logAgentCall(
  runId: string,
  agentRole: LlmAgentRole,
  claimId: string | undefined,
  model: string,
  tokensIn: number,
  tokensOut: number,
  latencyMs: number,
  countedAgainstBudget: boolean,
): Promise<void> {
  try {
    const supabase = await createClient();
    const prices = MODEL_LIST_PRICES[model] ?? { input: 0, output: 0 };
    const cost_usd = (tokensIn / 1_000_000) * prices.input + (tokensOut / 1_000_000) * prices.output;

    await supabase.from('agent_calls').insert({
      run_id: runId,
      agent_role: dbAgentRole(agentRole),
      claim_id: claimId ?? null,
      model,
      input_tokens: tokensIn,
      output_tokens: tokensOut,
      cost_usd,
      latency_ms: latencyMs,
    });

    if (countedAgainstBudget) {
      await supabase.rpc('increment_requests_used', { run_id: runId });
    }
  } catch {
    // swallow — ledger failure must never abort a call
  }
}

// ============================================================
// JSON PARSE + SCHEMA VALIDATION
// ============================================================
function tryParse<T>(
  raw: string,
  schema: z.ZodType<T>,
): { success: true; data: T } | { success: false; error: string } {
  try {
    const obj = extractJson(raw);
    const result = schema.safeParse(obj);
    if (result.success) return { success: true, data: result.data };
    const msg = result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    return { success: false, error: msg.slice(0, 200) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function preview(text: string): string {
  return text.slice(0, 300).replace(/\s+/g, ' ');
}

// ============================================================
// THE ONE CALL — every agent routes through this
// ============================================================
export async function callLlm<T = unknown>(params: LlmCallParams<T>): Promise<LlmCallResult<T>> {
  const {
    runId,
    agentRole,
    claimId,
    model,
    systemPrompt,
    userPrompt,
    responseSchema,
    timeoutMs = DEFAULT_LLM_TIMEOUT_MS,
    temperature = 0.2,
    maxTokens = 2048,
    reasoning,
    _attempt = 1,
  } = params;

  const startTime = Date.now();

  // 0. BUDGET CHECK — before dispatch, per the AI-provider directive.
  const budget = await checkBudget(runId);
  if (!budget.ok) {
    await applyBudgetStatus(runId, budget);
    await logLlmEvent(
      runId,
      agentRole,
      claimId,
      'budget_halted',
      `Call blocked: request budget exhausted (${budget.requests_used}/${budget.request_budget})`,
    );
    return { success: false, error: 'BUDGET_EXHAUSTED', tokensIn: 0, tokensOut: 0, latencyMs: 0 };
  }
  if (budget.status !== 'ok') {
    // Warning tier — record the degrade but proceed.
    await applyBudgetStatus(runId, budget);
  }

  // Config guard — a missing key must fail loudly and instantly, not hang.
  if (!OPENROUTER_KEY) {
    await logLlmEvent(runId, agentRole, claimId, 'failed', 'OPENROUTER_API_KEY is not configured — cannot dispatch');
    return { success: false, error: 'MISSING_API_KEY', tokensIn: 0, tokensOut: 0, latencyMs: 0 };
  }

  // 1. DISPATCHED — fires unconditionally, immediately before the network call.
  //    THIS is the line whose absence made the original hang invisible.
  await logLlmEvent(
    runId,
    agentRole,
    claimId,
    'dispatched',
    `Sending request to ${model} (prompt: ${userPrompt.length} chars, timeout ${timeoutMs}ms)${_attempt > 1 ? ` [attempt ${_attempt}/${LLM_MAX_ATTEMPTS}]` : ''}`,
  );

  // The guaranteed deadline. Without this, a stalled provider hangs forever.
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/popper-verify/popper',
        'X-Title': 'Popper - Adversarial Claim Verification',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
        ...(reasoning ? { reasoning } : {}),
        provider: PROVIDER_PREFERENCES,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutHandle);
    const latencyMs = Date.now() - startTime;

    // 2. RESPONDED — logged regardless of status code; a 4xx/5xx is still signal.
    await logLlmEvent(runId, agentRole, claimId, 'responded', `HTTP ${response.status} after ${latencyMs}ms`);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');

      // Retry transient failures (rate limit / capacity) with backoff before
      // giving up — otherwise a momentary 429 becomes a false "unverifiable".
      if (RETRYABLE_STATUS.has(response.status) && _attempt < LLM_MAX_ATTEMPTS) {
        const retryAfterS = Number(response.headers.get('retry-after'));
        const backoffMs =
          Number.isFinite(retryAfterS) && retryAfterS > 0
            ? Math.min(30_000, retryAfterS * 1000)
            : Math.min(15_000, 1_500 * 2 ** (_attempt - 1));
        await logLlmEvent(
          runId,
          agentRole,
          claimId,
          'responded',
          `Transient HTTP ${response.status} — backing off ${backoffMs}ms then retrying (attempt ${_attempt}/${LLM_MAX_ATTEMPTS})`,
        );
        await sleep(backoffMs);
        return callLlm<T>({ ...params, _attempt: _attempt + 1 });
      }

      await logLlmEvent(
        runId,
        agentRole,
        claimId,
        'failed',
        `Non-OK response: ${response.status} — ${errorBody.slice(0, 300)}`,
      );
      // Reached the provider and got a status code → consumed a real rate slot.
      await logAgentCall(runId, agentRole, claimId, model, 0, 0, latencyMs, true);
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorBody.slice(0, 300)}`,
        tokensIn: 0,
        tokensOut: 0,
        latencyMs,
      };
    }

    const json = await response.json();
    const rawText: string = json?.choices?.[0]?.message?.content ?? '';
    const tokensIn: number = json?.usage?.prompt_tokens ?? 0;
    const tokensOut: number = json?.usage?.completion_tokens ?? 0;
    const resolvedModel: string = json?.model ?? model;

    // Successful HTTP call → counts against budget and is logged to the ledger.
    await logAgentCall(runId, agentRole, claimId, resolvedModel, tokensIn, tokensOut, latencyMs, true);

    // 3. PARSED (+ optional schema validation). A response that comes back but
    //    doesn't match the expected shape is a FAILED, not silent garbage passed
    //    downstream into the Claim Graph.
    if (responseSchema) {
      const parsed = tryParse<T>(rawText, responseSchema);
      if (!parsed.success) {
        await logLlmEvent(
          runId,
          agentRole,
          claimId,
          'failed',
          `Response did not match expected schema: ${parsed.error}. Raw (300 chars): "${preview(rawText)}"`,
        );
        return {
          success: false,
          error: `Schema validation failed: ${parsed.error}`,
          rawText,
          tokensIn,
          tokensOut,
          latencyMs,
        };
      }
      await logLlmEvent(runId, agentRole, claimId, 'parsed', `Response validated against expected schema (${latencyMs}ms)`);
      return { success: true, data: parsed.data, rawText, tokensIn, tokensOut, latencyMs };
    }

    await logLlmEvent(
      runId,
      agentRole,
      claimId,
      'parsed',
      `Response received (${rawText.length} chars, no schema validation requested, ${latencyMs}ms)`,
    );
    return { success: true, rawText, tokensIn, tokensOut, latencyMs };
  } catch (err) {
    clearTimeout(timeoutHandle);
    const latencyMs = Date.now() - startTime;

    // 4. TIMED_OUT — the exact failure mode from the bug report. It is now
    //    IMPOSSIBLE to hang silently past this point: the AbortController fires,
    //    fetch rejects with AbortError, and we emit a terminal trace event.
    if (err instanceof Error && err.name === 'AbortError') {
      await logLlmEvent(
        runId,
        agentRole,
        claimId,
        'timed_out',
        `No response from ${model} within ${timeoutMs}ms — aborted`,
      );
      // Dispatched + connection accepted before we aborted → still consumed a
      // rate slot on the provider. Count it, or we under-report real usage.
      await logAgentCall(runId, agentRole, claimId, model, 0, 0, latencyMs, true);
      return { success: false, error: 'TIMEOUT', tokensIn: 0, tokensOut: 0, latencyMs };
    }

    // Network-level error (connection reset/drop). Retry if attempts remain —
    // these are usually transient too.
    if (_attempt < LLM_MAX_ATTEMPTS) {
      const backoffMs = Math.min(15_000, 1_500 * 2 ** (_attempt - 1));
      await logLlmEvent(
        runId,
        agentRole,
        claimId,
        'responded',
        `Network error "${(err instanceof Error ? err.message : String(err)).slice(0, 160)}" — backing off ${backoffMs}ms then retrying (attempt ${_attempt}/${LLM_MAX_ATTEMPTS})`,
      );
      await sleep(backoffMs);
      return callLlm<T>({ ...params, _attempt: _attempt + 1 });
    }

    await logLlmEvent(
      runId,
      agentRole,
      claimId,
      'failed',
      `Unhandled error: ${err instanceof Error ? err.message : String(err)}`,
    );
    // Most triggers here (mid-flight connection drop, or a JSON error on a real
    // 200 before we logged success) consumed a slot. A pre-connection DNS/refused
    // failure would not, but over-counting that rare case is the safe direction.
    await logAgentCall(runId, agentRole, claimId, model, 0, 0, latencyMs, true);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      tokensIn: 0,
      tokensOut: 0,
      latencyMs,
    };
  }
}
