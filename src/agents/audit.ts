/**
 * AUDIT AGENT (Orchestrator/Audit)
 * 
 * Mostly deterministic TypeScript. One LLM call for the natural-language trace summary.
 * Everything else (trust density, cost totals, run finalization) is plain DB reads.
 * 
 * The trace summary's credibility depends on it being mechanically derived from actual
 * DB state, not narrated by a model that could hallucinate. Hence the LLM only
 * does prose formatting of data the TypeScript has already computed.
 */

import { MODELS } from '@/lib/openrouter';
import { callLlm } from '@/lib/llm/call';
import { createClient } from '@/lib/supabase/server';
import type { Claim, StateDiff } from '@/types';


export async function runAudit(params: { runId: string }): Promise<{
  trustDensity: number;
  confirmedCount: number;
  contradictedCount: number;
  unverifiableCount: number;
  totalClaims: number;
  summary: string;
}> {
  const { runId } = params;
  const supabase = await createClient();

  // Fetch all claims
  const { data: claims } = await supabase
    .from('claims')
    .select('*')
    .eq('run_id', runId);

  const allClaims = (claims ?? []) as Claim[];
  const totalClaims = allClaims.length;
  const confirmedCount = allClaims.filter(c => c.status === 'confirmed').length;
  const contradictedCount = allClaims.filter(c => c.status === 'contradicted').length;
  const unverifiableCount = allClaims.filter(c => c.status === 'unverifiable').length;

  // Trust density: confirmed / total (0 if no claims)
  const trustDensity = totalClaims > 0 ? confirmedCount / totalClaims : 0;

  // Fetch state_diffs for summary
  const { data: diffs } = await supabase
    .from('state_diffs')
    .select('*')
    .eq('run_id', runId)
    .order('created_at', { ascending: true });

  const stateDiffs = (diffs ?? []) as StateDiff[];

  // Fetch cost totals
  const { data: calls } = await supabase
    .from('agent_calls')
    .select('agent_role, cost_usd, model, latency_ms')
    .eq('run_id', runId);

  const totalCostUsd = (calls ?? []).reduce((sum: number, c: { cost_usd: number }) => sum + c.cost_usd, 0);
  const { data: run } = await supabase.from('runs').select('requests_used, request_budget').eq('id', runId).single();
  const requestsUsed = run?.requests_used ?? 0;
  const requestBudget = run?.request_budget ?? 45;

  // Update runs with computed trust density and completion
  await supabase
    .from('runs')
    .update({
      trust_density: trustDensity,
      state: 'done',
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId);

  // Build structured trace summary for LLM (plain TypeScript data, not free-form text)
  const traceSummary = stateDiffs
    .filter(d => d.reason && d.reason.length > 10) // skip trivial trigger entries
    .slice(-30) // last 30 meaningful events
    .map(d => `[${d.agent_role.toUpperCase()}] ${d.field_changed}: ${d.old_value ?? '—'} → ${d.new_value ?? '—'} | ${d.reason}`)
    .join('\n');

  // ONE LLM call for prose summary (low stakes — any model works). Routed
  // through the shared wrapper so it too has a guaranteed timeout + trace
  // events. Note: 'audit' is a logical role; the wrapper maps it to the
  // DB-valid 'orchestrator' agent_role when writing trace/ledger rows.
  const deterministicSummary = `Verification run completed. ${totalClaims} claims processed: ${confirmedCount} confirmed, ${contradictedCount} contradicted, ${unverifiableCount} unverifiable. Trust density: ${(trustDensity * 100).toFixed(0)}%. ${requestsUsed} of ${requestBudget} allowed requests used.`;

  const summaryResult = await callLlm({
    runId,
    agentRole: 'audit',
    model: MODELS.audit,
    temperature: 0.3,
    maxTokens: 512,
    systemPrompt: `You write concise, accurate summaries of automated audit logs. Your summary must be grounded in the data provided — do not add information not present in the log. Write in past tense, third person. 2-4 sentences maximum.`,
    userPrompt: `Write a 2-4 sentence summary of this verification run. Use only these facts:
- Total claims: ${totalClaims}
- Confirmed: ${confirmedCount} (${(trustDensity * 100).toFixed(0)}% trust density)
- Contradicted: ${contradictedCount}
- Unverifiable: ${unverifiableCount}
- Requests used: ${requestsUsed}/${requestBudget}
- List-price equivalent cost: $${totalCostUsd.toFixed(4)} (actual: $0.00 on free tier)
- Key events from trace:
${traceSummary.slice(0, 800)}`,
  });

  // Low-stakes finishing step: on any call failure, fall back to the
  // deterministic summary. This must NEVER break a run at the finish line.
  const summary = summaryResult.success && summaryResult.rawText?.trim()
    ? summaryResult.rawText.trim()
    : deterministicSummary;

  // Log audit completion
  await supabase.from('state_diffs').insert({
    run_id: runId,
    claim_id: null,
    agent_role: 'orchestrator',
    field_changed: 'run_state',
    old_value: 'audit',
    new_value: 'done',
    reason: `Audit complete. Trust density: ${(trustDensity * 100).toFixed(1)}%. ${confirmedCount}/${totalClaims} claims confirmed. ${requestsUsed} requests used.`,
  });

  return {
    trustDensity,
    confirmedCount,
    contradictedCount,
    unverifiableCount,
    totalClaims,
    summary,
  };
}
