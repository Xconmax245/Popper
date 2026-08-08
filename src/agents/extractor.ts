/**
 * EXTRACTOR AGENT
 * 
 * Extracts discrete, citation-backed factual claims from academic text.
 * Model: openai/gpt-oss-20b:free (reliable structured JSON output)
 * 
 * Design invariant: this agent WRITES to the claims table.
 * It does NOT pass extracted claims as strings to any other agent.
 * The Claim Graph is the only channel.
 */

import { MODELS } from '@/lib/openrouter';
import { callLlm, LlmCallError } from '@/lib/llm/call';
import { createClient } from '@/lib/supabase/server';
import type { ExtractorOutput, ExtractedClaim } from '@/types';
import { ExtractorOutputSchema } from '@/types';


const EXTRACTOR_SYSTEM_PROMPT = `You are a precision claim extractor for academic papers. Your job is to identify discrete, independently verifiable, citation-backed factual claims.

RULES — follow these exactly:
1. Extract ONLY claims that have an explicit citation attached in the source text.
2. Do NOT extract opinions, hedged statements ("may suggest", "could indicate", "appears to"), or claims with no citation.
3. Do NOT extract methodological descriptions unless they are factual claims about prior work.
4. Each claim must be independently verifiable against its cited source.
5. RESOLVE NUMBERED CITATIONS. The paper text includes a REFERENCES / BIBLIOGRAPHY section at the end. If a claim cites a numbered reference like "[22]" or "[22, 42]", look that number up in the REFERENCES section and put the FULL reference (authors, title, year, venue) into cited_source_raw — e.g. "Vaswani et al., Attention Is All You Need, 2017". Never emit a bare "[22]" as the citation: a bracket number alone cannot be resolved to a real source downstream. You should almost always be able to resolve it from the REFERENCES section.

OUTPUT FORMAT — return valid JSON only, no markdown, no prose:
{
  "claims": [
    {
      "source_sentence": "<exact sentence from the text, copied verbatim>",
      "paraphrased_claim": "<normalized one-sentence factual claim, third person, no hedging>",
      "cited_source_raw": "<the RESOLVED citation — authors + title + year taken from the REFERENCES section (e.g. 'Vaswani et al., Attention Is All You Need, 2017'). Copy author-year citations as written. Use null ONLY if there is truly no citation. Do NOT emit a bare '[24]'.>"
    }
  ],
  "reason": "<only present if claims is empty — explain why no extractable claims were found>"
}

If the paper has zero extractable citation-backed claims, return {"claims": [], "reason": "<specific reason>"}.
Do NOT fabricate claims to have something to show. An honest empty result is better than invented data.`;

// ============================================================
// INPUT ASSEMBLY — body + References (BUG FIX)
// ============================================================
// A full paper body is larger than one model prompt should carry, so we
// truncate — but the bibliography is NON-NEGOTIABLE: without it a claim citing
// "[22]" cannot be tied to a real source and is doomed to a false
// "unverifiable". So we budget the body and the references SEPARATELY and always
// include both, rather than letting head-truncation eat the References section
// off the end of the document.
const EXTRACTOR_BODY_BUDGET = 12_000;
const EXTRACTOR_REFS_BUDGET = 12_000;

/**
 * Index of the start of the References/Bibliography section, or -1 if none.
 * Uses the LAST heading-like match because the words "references"/"bibliography"
 * also appear in prose earlier in the paper; the real section sits at the end.
 */
function locateReferencesSection(text: string): number {
  const re = /(^|\n)[ \t]*(references|bibliography)[ \t]*(\n|:)/gi;
  let idx = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    idx = m.index + (m[1] ? m[1].length : 0);
  }
  return idx;
}

/**
 * Assemble the Extractor's input as body(truncated) + References(truncated),
 * clearly delimited. Falls back to plain head-truncation only when no
 * bibliography heading can be found.
 */
export function buildExtractorInput(paperText: string): {
  text: string;
  refsIncluded: boolean;
  note: string;
} {
  const refIdx = locateReferencesSection(paperText);

  if (refIdx === -1) {
    const head = paperText.slice(0, EXTRACTOR_BODY_BUDGET);
    return {
      text: head,
      refsIncluded: false,
      note: `no References/Bibliography heading found — sent first ${head.length} chars of body only (numbered-citation resolution will be limited)`,
    };
  }

  const body = paperText.slice(0, refIdx).slice(0, EXTRACTOR_BODY_BUDGET);
  const refs = paperText.slice(refIdx, refIdx + EXTRACTOR_REFS_BUDGET);
  const text = `${body}\n\n===== REFERENCES / BIBLIOGRAPHY (verbatim — use to resolve numbered citations) =====\n${refs}`;
  return {
    text,
    refsIncluded: true,
    note: `body ${body.length} chars + references ${refs.length} chars (bibliography preserved for citation resolution)`,
  };
}

export async function runExtractor(params: {
  runId: string;
  paperText: string;
}): Promise<{ claimIds: string[]; totalExtracted: number }> {
  const { runId, paperText } = params;
  const supabase = await createClient();

  // BUG FIX (references truncation): naive head-truncation dropped the
  // References/Bibliography section (it lives at the END of a multi-page paper),
  // which made numbered citations like "[22]" structurally unresolvable and
  // forced every such claim to a false "unverifiable". buildExtractorInput
  // ALWAYS carries the bibliography through, splitting the char budget between
  // body and references instead of letting the body consume all of it.
  const { text: extractorInput, refsIncluded, note } = buildExtractorInput(paperText);

  await supabase.from('state_diffs').insert({
    run_id: runId,
    claim_id: null,
    agent_role: 'extractor',
    field_changed: 'extractor_input',
    old_value: `${paperText.length} chars available`,
    new_value: `${extractorInput.length} chars sent (references ${refsIncluded ? 'INCLUDED' : 'NOT found'})`,
    reason: `Extractor input assembled: ${note}. References must be present so numbered citations ([n]) can be resolved to real sources.`,
  });

  // Route through the shared wrapper: guaranteed timeout, dispatched/responded/
  // parsed/failed/timed_out trace events, budget check, schema validation.
  const result = await callLlm<ExtractorOutput>({
    runId,
    agentRole: 'extractor',
    model: MODELS.extractor,
    temperature: 0.1, // Low temp — we want consistent structured output
    maxTokens: 8000,
    responseSchema: ExtractorOutputSchema,
    systemPrompt: EXTRACTOR_SYSTEM_PROMPT,
    userPrompt: `Extract a maximum of 10 citation-backed factual claims from the paper text below. The text contains the body followed by the REFERENCES section — use the REFERENCES section to resolve any numbered citations ([n]) into full author-title-year form in cited_source_raw.\n\n${extractorInput}`,
  });

  // CRITICAL: a call FAILURE (timeout, HTTP error, unparseable/invalid output)
  // is NOT the same as "the paper has no claims". The original bug reclassified
  // a failed/hung call as an empty extraction, which the FSM then treated as a
  // legitimate "0 claims" finding — silently. We now throw so the FSM routes
  // this to a DISTINCT, clearly-labeled error state instead.
  if (!result.success || !result.data) {
    throw new LlmCallError(
      'extractor',
      `Extractor LLM call did not produce a valid result: ${result.error ?? 'unknown error'}`,
    );
  }

  const parsed: ExtractorOutput = result.data;

  if (!parsed.claims || parsed.claims.length === 0) {
    // Log the explicit empty with reason
    await supabase.from('state_diffs').insert({
      run_id: runId,
      claim_id: null,
      agent_role: 'extractor',
      field_changed: 'extraction_result',
      old_value: null,
      new_value: 'empty',
      reason: `Extractor found no citation-backed claims: ${parsed.reason ?? 'No reason provided'}`,
    });
    return { claimIds: [], totalExtracted: 0 };
  }

  // Write all claims to DB — this is the only channel to downstream agents
  const claimInserts = parsed.claims.map((c: ExtractedClaim) => ({
    run_id: runId,
    source_sentence: c.source_sentence,
    paraphrased_claim: c.paraphrased_claim,
    cited_source_raw: c.cited_source_raw ?? null,
    status: 'pending' as const,
  }));

  const { data: inserted, error } = await supabase
    .from('claims')
    .insert(claimInserts)
    .select('id');

  if (error || !inserted) {
    throw new Error(`Failed to insert claims: ${error?.message}`);
  }

  const claimIds = inserted.map((r: { id: string }) => r.id);

  // Log extraction to trace
  await supabase.from('state_diffs').insert({
    run_id: runId,
    claim_id: null,
    agent_role: 'extractor',
    field_changed: 'extraction_result',
    old_value: '0 claims',
    new_value: `${claimIds.length} claims`,
    reason: `Extractor identified ${claimIds.length} citation-backed factual claims from the paper.`,
  });

  return { claimIds, totalExtracted: claimIds.length };
}
