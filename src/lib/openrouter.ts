/**
 * OpenRouter budget + cost-ledger helpers for Popper.
 *
 * NOTE: The actual OpenRouter network call now lives in `src/lib/llm/call.ts`
 * (`callLlm`). That is the ONE place a request is issued, and it does so with a
 * guaranteed AbortController timeout plus full dispatched/responded/parsed/
 * failed/timed_out trace logging.
 *
 * The previous `callLLM` in this file issued `fetch()` with NO timeout — a
 * stalled provider could hang the whole run forever with no trace signal. It has
 * been removed. This module now retains only:
 *   - checkBudget       (pre-call budget enforcement)
 *   - applyBudgetStatus (warning/halted → runs.budget_status + trace)
 *   - logCall           (legacy cost-ledger helper, kept for compatibility)
 *   - MODELS            (env-overridable model slugs)
 */

import { createClient } from '@/lib/supabase/server';
import type { LogCallParams, BudgetCheck, BudgetStatus } from '@/types';
import { MODEL_LIST_PRICES } from '@/types';

// Model slugs are env-overridable so a wrong/renamed slug on the free tier can
// be corrected without a code change or redeploy. Defaults match the preset.
export const MODELS = {
  extractor: process.env.MODEL_EXTRACTOR ?? 'openai/gpt-oss-20b:free',
  verifier: process.env.MODEL_VERIFIER ?? 'openai/gpt-oss-20b:free',
  synthesis: process.env.MODEL_SYNTHESIS ?? 'openai/gpt-oss-20b:free',
  audit: process.env.MODEL_AUDIT ?? 'openai/gpt-oss-20b:free',
  fallback: process.env.MODEL_FALLBACK ?? 'openai/gpt-oss-20b:free',
} as const;


export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterResponse {
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

// ============================================================
// BUDGET CHECK
// Called BEFORE every LLM request — this is the enforcement point
// for Section 0 Principle 5: "Every cost-incurring call is logged
// before the response is used"
// ============================================================
export async function checkBudget(runId: string): Promise<BudgetCheck> {
  const supabase = await createClient();
  const { data: run, error } = await supabase
    .from('runs')
    .select('requests_used, request_budget, budget_status')
    .eq('id', runId)
    .single();

  if (error || !run) {
    return { ok: false, status: 'halted', requests_used: 0, request_budget: 45, message: 'Failed to fetch run for budget check' };
  }

  const { requests_used, request_budget, budget_status } = run;

  if (budget_status === 'halted' || requests_used >= request_budget) {
    return { ok: false, status: 'halted', requests_used, request_budget, message: 'Request budget exhausted' };
  }

  if (requests_used >= Math.floor(request_budget * 0.8)) {
    return { ok: true, status: 'warning', requests_used, request_budget, message: `Approaching request budget (${requests_used}/${request_budget})` };
  }

  return { ok: true, status: 'ok', requests_used, request_budget };
}

// ============================================================
// LOG CALL (pre-response)
// Legacy helper retained for compatibility. The primary cost-ledger write now
// happens inside src/lib/llm/call.ts. Must be awaited BEFORE using a response.
// ============================================================
export async function logCall(params: LogCallParams): Promise<void> {
  const supabase = await createClient();
  const prices = MODEL_LIST_PRICES[params.model] ?? { input: 0, output: 0 };
  const cost_usd = (params.input_tokens / 1_000_000) * prices.input
                 + (params.output_tokens / 1_000_000) * prices.output;

  // Log the call
  await supabase.from('agent_calls').insert({
    run_id: params.run_id,
    agent_role: params.agent_role,
    claim_id: params.claim_id ?? null,
    model: params.model,
    input_tokens: params.input_tokens,
    output_tokens: params.output_tokens,
    cost_usd,
    latency_ms: params.latency_ms,
  });

  // Increment requests_used counter
  await supabase.rpc('increment_requests_used', { run_id: params.run_id });
}

// ============================================================
// APPLY BUDGET WARNING/DEGRADE
// Call this after checkBudget returns a non-ok status.
// Writes to state_diffs so the trace is complete.
// ============================================================
export async function applyBudgetStatus(runId: string, check: BudgetCheck): Promise<void> {
  if (check.status === 'ok') return;

  const supabase = await createClient();
  const newStatus: BudgetStatus = check.status;

  await supabase
    .from('runs')
    .update({ budget_status: newStatus })
    .eq('id', runId);

  const reason = newStatus === 'warning'
    ? `Orchestrator: approaching request budget (${check.requests_used}/${check.request_budget} used). Switching Verifier to single-source-check mode (CrossRef only, skip Semantic Scholar cross-check) for remaining claims.`
    : `Orchestrator: request budget reached (${check.requests_used}/${check.request_budget}). Remaining pending claims will be marked unverifiable.`;

  await supabase.from('state_diffs').insert({
    run_id: runId,
    claim_id: null,
    agent_role: 'orchestrator',
    field_changed: 'budget_status',
    old_value: 'ok',
    new_value: newStatus,
    reason,
  });
}

export type OpenRouterModel =
  | 'openai/gpt-oss-20b:free'
  | 'nvidia/nemotron-3-ultra:free'
  | 'poolside/laguna-xs-2.1:free';
