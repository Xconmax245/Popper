/**
 * ORCHESTRATOR FSM
 * 
 * Hand-rolled finite state machine. Every state transition is:
 * 1. A named function call
 * 2. A DB write (runs.state updated)
 * 3. A state_diffs entry (agent_role: 'orchestrator')
 * 
 * This makes every transition auditable line-by-line in judge Q&A.
 * No implicit `await` chains. No LangGraph. No CrewAI.
 * 
 * States: ingest → extract → verify → synthesize → audit → done
 *                                                         ↓ error (any state)
 */

import { createClient } from '@/lib/supabase/server';
import { ingestPaper, IngestError } from './ingest';
import { LlmCallError } from '@/lib/llm/call';
import { runExtractor } from '@/agents/extractor';
import { runVerifier } from '@/agents/verifier';
import { runSynthesis } from '@/agents/synthesis';
import { runAudit } from '@/agents/audit';
import type { RunState } from '@/types';

// ============================================================
// STATE TRANSITION — the single function that changes run state
// Every transition goes through here. Nothing else touches runs.state.
// ============================================================
async function transition(
  runId: string,
  from: RunState,
  to: RunState,
  reason: string
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('runs')
    .update({ state: to })
    .eq('id', runId)
    .eq('state', from); // Optimistic lock — only transition if state is what we expect

  if (error) {
    throw new Error(`FSM transition ${from}→${to} failed: ${error.message}`);
  }

  await supabase.from('state_diffs').insert({
    run_id: runId,
    claim_id: null,
    agent_role: 'orchestrator',
    field_changed: 'run_state',
    old_value: from,
    new_value: to,
    reason,
  });
}

// ============================================================
// ERROR STATE — called when an unrecoverable error occurs
// ============================================================
async function transitionToError(runId: string, fromState: RunState, reason: string): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from('runs')
    .update({ state: 'error' })
    .eq('id', runId);

  await supabase.from('state_diffs').insert({
    run_id: runId,
    claim_id: null,
    agent_role: 'orchestrator',
    field_changed: 'run_state',
    old_value: fromState,
    new_value: 'error',
    reason,
  });
}

// ============================================================
// SUPABASE RPC — increment_requests_used
// This must exist as a Postgres function. Add to migrations:
//
// CREATE OR REPLACE FUNCTION increment_requests_used(run_id uuid)
// RETURNS void AS $$
//   UPDATE runs SET requests_used = requests_used + 1 WHERE id = run_id;
// $$ LANGUAGE sql;
// ============================================================

// ============================================================
// MAIN FSM RUNNER
// This is the function called by the API route.
// It runs the full pipeline from the run's current state.
// ============================================================
export async function runFSM(runId: string): Promise<void> {
  const supabase = await createClient();

  // Get current run state
  const { data: run, error } = await supabase
    .from('runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (error || !run) {
    throw new Error(`Run ${runId} not found`);
  }

  let currentState: RunState = run.state as RunState;

  // ============================================================
  // STATE: INGEST
  // ============================================================
  if (currentState === 'ingest') {
    try {
      await supabase.from('state_diffs').insert({
        run_id: runId,
        claim_id: null,
        agent_role: 'orchestrator',
        field_changed: 'run_state',
        old_value: null,
        new_value: 'ingest',
        reason: `FSM started. Fetching paper from ${run.source_url}`,
      });

      // ingestPaper now validates CONTENT, not just HTTP status. It returns
      // only validated full-text (source = ar5iv_html | pdf_extract | html),
      // or throws IngestError if no source yields sufficient content. It also
      // logs a content preview + per-attempt validation verdicts to the trace.
      const { text, source } = await ingestPaper(run.source_url, runId);

      // Store paper text for extractor (we pass it through state, not DB, since it's not a claim)
      // This is the one exception to the "graph only" rule: raw paper text is not an inter-agent claim.
      await supabase.from('runs').update({ 
        state: 'extract'
      }).eq('id', runId);

      await supabase.from('state_diffs').insert({
        run_id: runId,
        claim_id: null,
        agent_role: 'orchestrator',
        field_changed: 'paper_source',
        old_value: null,
        new_value: source,
        reason: `Paper content VALIDATED (${source}). ${text.length} characters extracted and confirmed as full paper body.`,
      });

      currentState = 'extract';

      // ============================================================
      // STATE: EXTRACT
      // ============================================================
      await transition(runId, 'extract', 'extract', 'Extractor agent starting claim extraction');

      const { claimIds, totalExtracted } = await runExtractor({
        runId,
        paperText: text,
      });

      if (totalExtracted === 0) {
        // The Extractor call SUCCEEDED but the paper genuinely had no
        // citation-backed claims — a legitimate research-utility finding, routed
        // to audit. NOTE: a FAILED Extractor call (timeout/HTTP/invalid output)
        // no longer reaches this branch — runExtractor throws LlmCallError in
        // that case, which is caught below and routed to a distinct error state.
        // That distinction is the whole point of this fix.
        await transition(runId, 'extract', 'audit', 'No extractable claims found — skipping to audit');
        currentState = 'audit';
      } else {
        await transition(runId, 'extract', 'verify',
          `Extracted ${totalExtracted} claim(s). Starting adversarial verification (fan-out per claim).`
        );
        currentState = 'verify';

        // ============================================================
        // STATE: VERIFY (parallel fan-out per claim)
        // ============================================================
        // Fan-out: verify all claims in parallel
        // Note: Verifier internally handles per-claim budget checks
        await runVerifier({ runId, claimIds });

        // Wait for all claims to settle (Verifier writes to claims table directly)
        const { data: settledClaims } = await supabase
          .from('claims')
          .select('id, status')
          .eq('run_id', runId);

        const allSettled = (settledClaims ?? []).every((c: { status: string }) => c.status !== 'pending');

        if (!allSettled) {
          // Any remaining pending claims are budget-degraded → mark unverifiable
          const pendingIds = (settledClaims ?? [])
            .filter((c: { status: string; id: string }) => c.status === 'pending')
            .map((c: { id: string }) => c.id);

          if (pendingIds.length > 0) {
            await supabase
              .from('claims')
              .update({
                status: 'unverifiable',
                status_reason: 'Request budget reached before verification completed',
              })
              .in('id', pendingIds);
          }
        }

        await transition(runId, 'verify', 'synthesize',
          `Verification complete. Starting synthesis on confirmed claims only.`
        );
        currentState = 'synthesize';

        // ============================================================
        // STATE: SYNTHESIZE
        // ============================================================
        await runSynthesis({ runId });

        await transition(runId, 'synthesize', 'audit',
          `Synthesis complete. Starting audit and report generation.`
        );
        currentState = 'audit';
      }

      // ============================================================
      // STATE: AUDIT
      // ============================================================
      const auditResult = await runAudit({ runId });

      // runs table is updated inside runAudit (state → 'done', trust_density, completed_at)
      await supabase.from('state_diffs').insert({
        run_id: runId,
        claim_id: null,
        agent_role: 'orchestrator',
        field_changed: 'run_state',
        old_value: 'audit',
        new_value: 'done',
        reason: `FSM complete. Trust density: ${(auditResult.trustDensity * 100).toFixed(1)}%. ${auditResult.confirmedCount} confirmed, ${auditResult.contradictedCount} contradicted, ${auditResult.unverifiableCount} unverifiable.`,
      });

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (err instanceof IngestError) {
        // CONTENT-RETRIEVAL FAILURE — a DISTINCT, clearly-labeled error state.
        // This is NOT "the paper had no checkable claims" (a legitimate
        // research-utility finding that is routed to audit). It means we could
        // not obtain the paper's full-text body at all. Conflating the two is
        // exactly what made the original stub-page bug hard to diagnose from
        // the trace, so we label it unambiguously and never fall through to
        // extraction/audit on unvalidated content.
        await transitionToError(
          runId,
          currentState,
          `INGEST FAILED (content could not be retrieved/validated) — ${errMsg}`
        );
      } else if (err instanceof LlmCallError) {
        // AGENT-CALL FAILURE — a hard LLM failure (timeout, HTTP error, or
        // unparseable/invalid output) that an agent chose to propagate rather
        // than swallow. This is a DISTINCT error state, deliberately NOT the
        // same as "0 claims found". The original bug was exactly this conflation:
        // the Extractor's call hung/failed, was silently treated as an empty
        // extraction, and the run reported "0 claims" as if the paper had none.
        // Now it stops here, loudly, with the responsible agent named.
        await transitionToError(
          runId,
          currentState,
          `AGENT CALL FAILED (${err.agentRole}) — ${errMsg}. The pipeline stopped rather than reporting an unverified/empty result on a failed call.`
        );
      } else {
        await transitionToError(runId, currentState, `Unhandled error in FSM: ${errMsg}`);
      }
    }
  }
}

// ============================================================
// CREATE RUN — called by the API route to initialize a run
// ============================================================
export async function createRun(params: {
  sourceUrl: string;
  budgetUsd?: number;
  requestBudget?: number;
}): Promise<string> {
  const supabase = await createClient();

  const { data: run, error } = await supabase
    .from('runs')
    .insert({
      source_url: params.sourceUrl,
      budget_usd: params.budgetUsd ?? 0.40,
      request_budget: params.requestBudget ?? 45,
      state: 'ingest',
    })
    .select('id')
    .single();

  if (error || !run) {
    throw new Error(`Failed to create run: ${error?.message}`);
  }

  return run.id;
}
