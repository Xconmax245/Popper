/**
 * VERIFIER AGENT
 * 
 * Adversarial claim verification. Goal: FALSIFICATION, not confirmation.
 * Model: openai/gpt-oss-20b:free (structured JSON output, function calling)
 * 
 * Architecture:
 * 1. CrossRef + Semantic Scholar resolution happens in PLAIN TYPESCRIPT (no LLM tokens spent)
 * 2. ONE LLM call per claim (or per batch of 4-5 if quota is tight)
 * 3. LLM gets pre-fetched evidence and must do comparison + active falsification in one prompt
 * 
 * Design invariants:
 * - Reads from claims table (status='pending')
 * - Writes verdict back to claims table
 * - Never passes claim data as strings to other agents
 * - Max 4 external API calls per claim (logged as explicit design decision)
 */

import { checkBudget, applyBudgetStatus, MODELS } from '@/lib/openrouter';
import { callLlm } from '@/lib/llm/call';
import { createClient } from '@/lib/supabase/server';
import { resolveCitation, getWorkByDoi, extractAbstract, extractYear, scoreMatch, MATCH_CONFIDENCE_THRESHOLD } from '@/lib/external/crossref';
import type { MatchConfidence } from '@/lib/external/crossref';
import { batchFetchByDois, checkSourceAgreement } from '@/lib/external/semanticscholar';
import { z } from 'zod';
import type { VerifierVerdict, Claim } from '@/types';

// Gentle pacing between per-claim LLM calls to stay under free-tier rate limits
// (HTTP 429). callLlm already retries transient 429s with backoff; pacing here
// reduces how often that path is exercised on multi-claim runs. Override with
// VERIFIER_INTER_CLAIM_MS (set 0 to disable).
const VERIFIER_INTER_CLAIM_MS = Number(process.env.VERIFIER_INTER_CLAIM_MS ?? 1500);
const verifierSleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));


// Schema for JUST the fields the Verifier LLM returns. claim_id and
// cited_source_doi are supplied by our own code (not the model), so they are
// merged in after validation. Evidence fields are lenient (optional/nullable)
// because free models are inconsistent about emitting them — a missing
// evidence_url should NOT turn a good verdict into a schema failure.
const VerifierLlmOutputSchema = z.object({
  status: z.enum(['confirmed', 'contradicted', 'unverifiable']),
  confidence: z.number().min(0).max(1).nullable().optional(),
  status_reason: z.string(),
  evidence_url: z.string().nullable().optional(),
  evidence_snippet: z.string().nullable().optional(),
});


const VERIFIER_SYSTEM_PROMPT = `You are an adversarial claim verifier. Your ONLY goal is to find reasons a claim is false, unsupported, fabricated, or misattributed to its cited source.

OBJECTIVE: Falsification. Finding a problem is success. A verdict of "confirmed" is not the default — it requires the same evidentiary rigor as "contradicted."

VERDICTS:
- "confirmed": You have found specific primary-source evidence that the cited work actually makes this claim. You must cite the exact passage or data that confirms it. "No red flags found" is NOT sufficient for confirmed — you need positive evidence.
- "contradicted": You have found evidence that the claim is false, the citation is wrong, or the cited source says something materially different. Common patterns: wrong year, wrong finding, wrong author attribution, claim exaggerates/misrepresents the cited work.
- "unverifiable": You cannot find sufficient evidence either way. State the SPECIFIC reason: e.g. "cited source is paywalled", "DOI not found in CrossRef", "claim is too vague to check", "abstract insufficient and full text unavailable".

NEVER GUESS. If you're not sure, return "unverifiable" with the specific reason.

WORKED EXAMPLES:

Example 1 — Contradicted:
Claim: "Smith et al. (2021) demonstrated 94% accuracy on ImageNet."
Evidence: CrossRef resolves Smith et al. 2021 as a paper on medical imaging. Abstract says 87% accuracy on a clinical dataset, not ImageNet.
Verdict: contradicted — confidence: 0.85 — reason: "Cited work (Smith et al. 2021, DOI:10.1234/x) achieved 87% on a clinical imaging dataset, not 94% on ImageNet as claimed."

Example 2 — Confirmed:
Claim: "Jones et al. (2019) showed transformer attention heads specialize in syntactic roles."
Evidence: CrossRef resolves Jones 2019 to 'Attention is not Explanation'. Abstract explicitly states attention heads show syntactic specialization patterns.
Verdict: confirmed — confidence: 0.90 — reason: "Jones et al. (2019) directly states in their abstract that attention heads exhibit syntactic specialization, directly supporting the claim."

Example 3 — Unverifiable:
Claim: "Chen (2022) reported 12ms latency improvements."
Evidence: DOI resolves but points to a paywalled conference paper. Abstract only contains methods description. Cannot verify specific latency numbers.
Verdict: unverifiable — confidence: null — reason: "Cited work found (DOI:10.1145/xyz) but is paywalled. Abstract describes methods only; cannot verify the specific 12ms latency claim without access to results section."

OUTPUT FORMAT — valid JSON only, no markdown:
{
  "status": "confirmed" | "contradicted" | "unverifiable",
  "confidence": 0.0-1.0 or null,
  "status_reason": "<specific justification with evidence>",
  "evidence_url": "<url to the primary source used, or null>",
  "evidence_snippet": "<paraphrased excerpt supporting verdict, NOT verbatim copyrighted text, or null>"
}`;

interface ClaimWithEvidence {
  claim: Claim;
  crossrefAbstract: string | null;
  ssAbstract: string | null;
  resolvedDoi: string | null;
  crossrefUrl: string | null;
  agreementNote: string;
  year: number | null;
  // Set when the CrossRef match confidence gate fires — skip the LLM call entirely.
  lowConfidenceGate?: MatchConfidence & { threshold: number };
}

async function fetchEvidenceForClaim(claim: Claim, ssBatch: Map<string, SemanticScholarPaperType>): Promise<ClaimWithEvidence> {
  let resolvedDoi: string | null = null;
  let crossrefAbstract: string | null = null;
  let crossrefUrl: string | null = null;
  let year: number | null = null;
  let ssAbstract: string | null = null;

  // Step 1: CrossRef resolution (TypeScript, no LLM tokens)
  if (claim.cited_source_raw) {
    const crWork = await resolveCitation(claim.cited_source_raw);
    if (crWork) {
      // ── MATCH CONFIDENCE GATE ────────────────────────────────────────────────
      // Before trusting this DOI, score how well the resolved work actually
      // matches the raw citation text. If the match is weak (wrong DOI resolved
      // by CrossRef query ranking), passing it to the Verifier causes the
      // Verifier to reason correctly — on the wrong evidence. This gate prevents
      // those false verdicts at the source. 4/5 misses in the baseline eval
      // traced directly to this problem.
      const matchConf = scoreMatch(claim.cited_source_raw, crWork);
      if (matchConf.score < MATCH_CONFIDENCE_THRESHOLD) {
        // Return early — caller will write the unverifiable verdict without
        // making any LLM call, saving a request against the daily budget.
        return {
          claim,
          crossrefAbstract: null,
          ssAbstract: null,
          resolvedDoi: null,       // do NOT propagate the low-confidence DOI
          crossrefUrl: null,
          agreementNote: 'CrossRef match below confidence threshold — DOI suppressed',
          year: null,
          lowConfidenceGate: { ...matchConf, threshold: MATCH_CONFIDENCE_THRESHOLD },
        };
      }
      // ── END GATE ─────────────────────────────────────────────────────────────

      resolvedDoi = crWork.DOI;
      crossrefAbstract = extractAbstract(crWork);
      crossrefUrl = crWork.URL;
      year = extractYear(crWork);

      // If we got a DOI, try to also fetch full work
      if (resolvedDoi) {
        const fullWork = await getWorkByDoi(resolvedDoi);
        if (fullWork) {
          crossrefAbstract = extractAbstract(fullWork) || crossrefAbstract;
        }
      }
    }
  }

  // Step 2: Semantic Scholar lookup from batch (already fetched for all claims at once)
  if (resolvedDoi) {
    const ssPaper = ssBatch.get(resolvedDoi);
    if (ssPaper) {
      ssAbstract = ssPaper.abstract ?? null;
    }
  }

  // Agreement check
  const ssPaper = resolvedDoi ? ssBatch.get(resolvedDoi) : null;
  const { note: agreementNote } = checkSourceAgreement(resolvedDoi, ssPaper ?? null);

  return { claim, crossrefAbstract, ssAbstract, resolvedDoi, crossrefUrl, agreementNote, year };
}

// Build Verifier prompt from pre-fetched evidence
function buildVerifierPrompt(evidence: ClaimWithEvidence): string {
  const { claim, crossrefAbstract, ssAbstract, resolvedDoi, crossrefUrl, agreementNote, year } = evidence;

  const parts = [
    `CLAIM TO VERIFY:`,
    `"${claim.paraphrased_claim}"`,
    ``,
    `Source sentence: "${claim.source_sentence}"`,
    `Citation as written: ${claim.cited_source_raw ?? 'None'}`,
    ``,
    `PRE-FETCHED EVIDENCE (from CrossRef + Semantic Scholar):`,
    `Resolved DOI: ${resolvedDoi ?? 'Could not resolve'}`,
    `Publication year: ${year ?? 'Unknown'}`,
    `CrossRef abstract: ${crossrefAbstract ? crossrefAbstract.slice(0, 800) : 'Not available'}`,
    `Semantic Scholar abstract: ${ssAbstract ? ssAbstract.slice(0, 800) : 'Not available'}`,
    `Source agreement: ${agreementNote}`,
    `Evidence URL: ${crossrefUrl ?? 'None'}`,
    ``,
    `INSTRUCTIONS:`,
    `1. Compare the claim against the pre-fetched evidence above.`,
    `2. Actively attempt to FALSIFY the claim — look for year mismatches, wrong findings, misattribution.`,
    `3. If the pre-fetched evidence is insufficient to confirm or contradict, return "unverifiable" with the specific reason.`,
    `4. Return only the JSON verdict object.`,
  ];

  return parts.join('\n');
}

// Import type for SS paper
type SemanticScholarPaperType = import('@/types').SemanticScholarPaper;

export async function runVerifier(params: {
  runId: string;
  claimIds: string[];
}): Promise<void> {
  const { runId, claimIds } = params;
  const supabase = await createClient();

  // Fetch all pending claims for this run
  const { data: claims, error } = await supabase
    .from('claims')
    .select('*')
    .in('id', claimIds)
    .eq('status', 'pending');

  if (error || !claims || claims.length === 0) return;

  // Step 1: Batch CrossRef resolution to get all DOIs
  // (TypeScript, no LLM tokens — external API calls don't count against quota)
  const doiPromises = claims.map(c => 
    c.cited_source_raw ? resolveCitation(c.cited_source_raw) : Promise.resolve(null)
  );
  const crossrefResults = await Promise.all(doiPromises);
  const resolvedDois = crossrefResults
    .map(r => r?.DOI)
    .filter((doi): doi is string => Boolean(doi));

  // Step 2: ONE batch call to Semantic Scholar for all DOIs
  const ssBatch = await batchFetchByDois(resolvedDois);

  // Step 3: For each claim — check budget, then verify with one LLM call
  for (let i = 0; i < claims.length; i++) {
    const claim = claims[i] as Claim;

    // Pre-call budget check
    const budgetCheck = await checkBudget(runId);
    if (!budgetCheck.ok) {
      await applyBudgetStatus(runId, budgetCheck);
      // Mark remaining claims unverifiable due to budget
      const remainingIds = claims.slice(i).map((c: Claim) => c.id);
      await supabase
        .from('claims')
        .update({
          status: 'unverifiable',
          status_reason: 'Request budget reached before verification completed',
        })
        .in('id', remainingIds);

      await supabase.from('state_diffs').insert({
        run_id: runId,
        claim_id: null,
        agent_role: 'orchestrator',
        field_changed: 'status',
        old_value: 'pending',
        new_value: 'unverifiable',
        reason: `Budget exhausted. ${remainingIds.length} claims marked unverifiable. This is the graceful degrade — not an error.`,
      });
      return;
    }

    // In warning mode, skip Semantic Scholar (already batched so no cost difference,
    // but we log the intent explicitly for the trace)
    const warningMode = budgetCheck.status === 'warning';
    if (warningMode) {
      await supabase.from('state_diffs').insert({
        run_id: runId,
        claim_id: claim.id,
        agent_role: 'orchestrator',
        field_changed: 'verification_mode',
        old_value: 'full',
        new_value: 'degraded_single_source',
        reason: 'Budget warning active: Verifier running in single-source mode (CrossRef only) for this claim.',
      });
    }

    // Fetch evidence (TypeScript, no LLM tokens)
    const evidence = await fetchEvidenceForClaim(claim, ssBatch);

    // ── LOW-CONFIDENCE GATE: skip the LLM call entirely ──────────────────────
    // If CrossRef returned a result but the match confidence was below threshold,
    // fetchEvidenceForClaim already returned early with lowConfidenceGate set.
    // Write the verdict directly and move to the next claim.
    if (evidence.lowConfidenceGate) {
      const g = evidence.lowConfidenceGate;
      const gateReason = `CrossRef match confidence too low (${g.score.toFixed(2)} < ${g.threshold}) — titleSim=${g.titleSim.toFixed(2)}, authorMatch=${g.authorMatch}, yearMatch=${g.yearMatch}. Not passing unreliable evidence to Verifier.`;

      await supabase.from('claims').update({
        status: 'unverifiable',
        status_reason: gateReason,
        confidence: null,
        evidence_url: null,
        evidence_snippet: null,
        cited_source_doi: null,
      }).eq('id', claim.id);

      await supabase.from('state_diffs').insert({
        run_id: runId,
        claim_id: claim.id,
        agent_role: 'verifier',
        field_changed: 'status',
        old_value: 'pending',
        new_value: 'unverifiable',
        reason: gateReason,
      });

      if (VERIFIER_INTER_CLAIM_MS > 0) await verifierSleep(VERIFIER_INTER_CLAIM_MS / 2);
      continue;
    }
    // ── END GATE ─────────────────────────────────────────────────────────────

    // ONE LLM call per claim — routed through the shared wrapper (guaranteed
    // timeout + dispatched/responded/parsed/failed/timed_out trace events).
    const result = await callLlm<z.infer<typeof VerifierLlmOutputSchema>>({
      runId,
      agentRole: 'verifier',
      claimId: claim.id,
      model: MODELS.verifier,
      temperature: 0.1,
      // BUG FIX (empty/unbalanced JSON): gpt-oss-20b is a reasoning model. With a
      // tight 1024-token budget its chain-of-thought could consume the entire
      // allotment before any JSON was emitted, yielding empty/truncated output
      // that then collapsed to a false "unverifiable". Give the verdict real room
      // AND cap/return-exclude reasoning so the tokens go to the JSON, not the CoT.
      maxTokens: 4000,
      reasoning: { effort: 'low', exclude: true },
      responseSchema: VerifierLlmOutputSchema,
      systemPrompt: VERIFIER_SYSTEM_PROMPT,
      userPrompt: buildVerifierPrompt(evidence),
    });

    let verdict: VerifierVerdict;
    if (result.success && result.data) {
      verdict = {
        claim_id: claim.id,
        status: result.data.status,
        confidence: result.data.confidence ?? null,
        status_reason: result.data.status_reason,
        evidence_url: result.data.evidence_url ?? evidence.crossrefUrl,
        evidence_snippet: result.data.evidence_snippet ?? null,
        cited_source_doi: evidence.resolvedDoi,
      };
    } else {
      // Call failed / timed out / malformed → THIS claim is unverifiable, with a
      // specific reason. A per-claim failure degrades only this claim; it does
      // NOT abort the whole run (that would throw away already-verified claims).
      // The wrapper has already logged the failed/timed_out event to the trace,
      // so this is visible, not silent.
      verdict = {
        claim_id: claim.id,
        status: 'unverifiable',
        confidence: null,
        status_reason: `Verifier call did not return a usable verdict (${result.error ?? 'unknown error'}). Marked unverifiable.`,
        evidence_url: evidence.crossrefUrl,
        evidence_snippet: null,
        cited_source_doi: evidence.resolvedDoi,
      };
    }

    // Write verdict to claims table
    // The AFTER UPDATE trigger will also write to state_diffs automatically
    const { error: updateErr } = await supabase
      .from('claims')
      .update({
        status: verdict.status,
        status_reason: verdict.status_reason,
        confidence: verdict.confidence,
        evidence_url: verdict.evidence_url,
        evidence_snippet: verdict.evidence_snippet,
        cited_source_doi: verdict.cited_source_doi,
      })
      .eq('id', claim.id);

    if (!updateErr) {
      // Application-layer state_diff (richer than trigger — includes reason)
      await supabase.from('state_diffs').insert({
        run_id: runId,
        claim_id: claim.id,
        agent_role: 'verifier',
        field_changed: 'status',
        old_value: 'pending',
        new_value: verdict.status,
        reason: verdict.status_reason,
      });
    }

    // Pace before the next claim to stay under free-tier rate limits (429).
    if (VERIFIER_INTER_CLAIM_MS > 0) {
      await verifierSleep(VERIFIER_INTER_CLAIM_MS);
    }
  }
}

