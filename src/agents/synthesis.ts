/**
 * SYNTHESIS AGENT
 * 
 * Generates research hypotheses ONLY from confirmed claims.
 * Model: nvidia/nemotron-3-ultra:free (larger reasoning model for dependency logic)
 * 
 * REFUSALS ARE A FEATURE:
 * - This agent must refuse any hypothesis that depends on a non-confirmed claim.
 * - Refusals are logged to state_diffs — they are not silent skips.
 * - The demo MUST show at least one logged refusal to satisfy acceptance criteria.
 * 
 * Design invariants:
 * - Reads ONLY confirmed claims from claims table
 * - Writes hypotheses to hypotheses table
 * - Writes refusals to state_diffs
 * - Never passes claim text as strings to other agents
 */

import { MODELS } from '@/lib/openrouter';
import { callLlm } from '@/lib/llm/call';
import { createClient } from '@/lib/supabase/server';
import type { SynthesisOutput, Claim } from '@/types';
import { SynthesisOutputSchema } from '@/types';


const SYNTHESIS_SYSTEM_PROMPT = `You are a research hypothesis generator. You propose novel research directions grounded EXCLUSIVELY in claims that have been independently verified as factually accurate.

ABSOLUTE RULES:
1. Use ONLY claims from the "CONFIRMED CLAIMS" section. Claims in "ALL CLAIMS (for reference)" that are not confirmed may NOT be used as hypothesis support.
2. For each hypothesis you propose, list every confirmed claim it depends on. Check each dependency — if any claim in your hypothesis's reasoning chain is not in the confirmed list, REFUSE that hypothesis path.
3. When you refuse a hypothesis path, state EXACTLY which claim caused the refusal and why (e.g., "Claim C-2 is 'contradicted' — this path is blocked").
4. Do not quietly substitute a different claim if a dependency fails — flag it explicitly.
5. Every accepted hypothesis must include its full provenance: which confirmed claims support it, their source sentences, and DOIs where available.

HYPOTHESIS QUALITY:
- Propose genuine research hypotheses, not summaries of existing findings.
- A hypothesis should suggest an experiment, investigation, or extension of the confirmed findings.
- Each hypothesis should be falsifiable and specific.

OUTPUT FORMAT — valid JSON only, no markdown:
{
  "hypotheses": [
    {
      "statement": "<the research hypothesis, one clear sentence>",
      "provenance": [
        {
          "claim_id": "<uuid>",
          "source_sentence": "<exact source sentence>",
          "doi": "<doi or null>"
        }
      ]
    }
  ],
  "refusals": [
    {
      "attempted_hypothesis": "<the hypothesis you considered but rejected>",
      "rejected_claim_ids": ["<uuid of blocking claim>"],
      "reason": "<which claim caused the refusal and why it blocks this hypothesis>"
    }
  ]
}

If no hypotheses can be built from confirmed claims alone, return {"hypotheses": [], "refusals": [{"attempted_hypothesis": "...", "rejected_claim_ids": [], "reason": "No confirmed claims available to ground any hypothesis."}]}`;

export async function runSynthesis(params: { runId: string }): Promise<void> {
  const { runId } = params;
  const supabase = await createClient();

  // Read ALL claims for context (Synthesis needs to know what was rejected)
  const { data: allClaims } = await supabase
    .from('claims')
    .select('*')
    .eq('run_id', runId);

  const confirmedClaims = (allClaims ?? []).filter((c: Claim) => c.status === 'confirmed');
  const nonConfirmedClaims = (allClaims ?? []).filter((c: Claim) => c.status !== 'confirmed' && c.status !== 'pending');

  // Explicitly publicly reject all non-confirmed claims before proceeding
  for (const claim of nonConfirmedClaims) {
    await supabase.from('state_diffs').insert({
      run_id: runId,
      claim_id: claim.id,
      agent_role: 'synthesis',
      field_changed: 'claim_rejected',
      old_value: claim.status,
      new_value: 'rejected_by_synthesis',
      reason: `Public rejection: claim is ${claim.status} and cannot be used for hypothesis generation.`,
    });
  }

  if (confirmedClaims.length === 0) {
    await supabase.from('state_diffs').insert({
      run_id: runId,
      claim_id: null,
      agent_role: 'synthesis',
      field_changed: 'synthesis_result',
      old_value: 'n/a',
      new_value: 'hypothesis_refused',
      reason: 'No confirmed claims remain after public rejection of all non-confirmed nodes.',
    });
    return;
  }

  // Build the synthesis prompt with claim lists
  const confirmedList = confirmedClaims.map((c: Claim, i: number) =>
    `C-${i + 1} [ID:${c.id}]\nClaim: "${c.paraphrased_claim}"\nSource: "${c.source_sentence}"\nDOI: ${c.cited_source_doi ?? 'none'}`
  ).join('\n\n');

  const nonConfirmedList = nonConfirmedClaims.map((c: Claim) =>
    `[ID:${c.id}] (${c.status.toUpperCase()}) "${c.paraphrased_claim}"`
  ).join('\n');

  const userPrompt = `CONFIRMED CLAIMS (the ONLY claims you may use to build hypotheses):
${confirmedList}

ALL CLAIMS — for reference only (DO NOT use these in hypotheses):
${nonConfirmedList || 'None'}

Generate research hypotheses grounded exclusively in the confirmed claims above. For each hypothesis path you consider and reject, document the refusal with the blocking claim ID.`;

  // Route through the shared wrapper (guaranteed timeout + full trace events).
  const result = await callLlm<SynthesisOutput>({
    runId,
    agentRole: 'synthesis',
    model: MODELS.synthesis,
    temperature: 0.4,
    maxTokens: 2048,
    responseSchema: SynthesisOutputSchema,
    systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
    userPrompt,
  });

  if (!result.success || !result.data) {
    // Synthesis is additive (it produces hypotheses); a failure here degrades to
    // "no hypotheses this run" rather than killing an otherwise-good run — the
    // Verifier's confirmed claims are already persisted. The wrapper has already
    // logged the failed/timed_out event, so this is visible, not silent.
    await supabase.from('state_diffs').insert({
      run_id: runId,
      claim_id: null,
      agent_role: 'synthesis',
      field_changed: 'synthesis_result',
      old_value: null,
      new_value: 'call_failed',
      reason: `Synthesis produced no usable output (${result.error ?? 'unknown error'}). No hypotheses generated this run.`,
    });
    return;
  }

  const output: SynthesisOutput = result.data;

  // Write accepted hypotheses to hypotheses table
  for (const h of output.hypotheses) {
    // Validate all provenance claim IDs are actually confirmed
    const validProvenance = h.provenance.filter(p =>
      confirmedClaims.some((c: Claim) => c.id === p.claim_id)
    );

    const invalidProvenance = h.provenance.filter(p =>
      !confirmedClaims.some((c: Claim) => c.id === p.claim_id)
    );

    if (invalidProvenance.length > 0) {
      // Agent tried to sneak in a non-confirmed claim — log as refusal
      await supabase.from('state_diffs').insert({
        run_id: runId,
        claim_id: null,
        agent_role: 'synthesis',
        field_changed: 'hypothesis_rejected',
        old_value: null,
        new_value: 'rejected',
        reason: `Synthesis attempted hypothesis "${h.statement.slice(0, 100)}..." but referenced non-confirmed claim IDs: ${invalidProvenance.map(p => p.claim_id).join(', ')}. Hypothesis blocked.`,
      });
      continue; // Do not write to hypotheses table
    }

    await supabase.from('hypotheses').insert({
      run_id: runId,
      statement: h.statement,
      provenance: validProvenance,
      rejected_claim_ids: output.refusals.flatMap(r => r.rejected_claim_ids),
    });

    await supabase.from('state_diffs').insert({
      run_id: runId,
      claim_id: null,
      agent_role: 'synthesis',
      field_changed: 'hypothesis_accepted',
      old_value: null,
      new_value: h.statement.slice(0, 100),
      reason: `Synthesis accepted hypothesis with ${validProvenance.length} confirmed claim(s) as provenance.`,
    });
  }

  // Log all refusals — these are the feature, not the fallback
  for (const refusal of output.refusals) {
    await supabase.from('state_diffs').insert({
      run_id: runId,
      claim_id: null,
      agent_role: 'synthesis',
      field_changed: 'hypothesis_refused',
      old_value: null,
      new_value: 'refused',
      reason: `SYNTHESIS REFUSAL: "${refusal.attempted_hypothesis.slice(0, 120)}" — blocked by claim(s) ${refusal.rejected_claim_ids.join(', ')}: ${refusal.reason}`,
    });
  }
}
