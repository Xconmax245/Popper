import { z } from 'zod';

// ============================================================
// ENUMS
// ============================================================

export const ClaimStatus = z.enum(['pending', 'confirmed', 'contradicted', 'unverifiable']);
export type ClaimStatus = z.infer<typeof ClaimStatus>;

export const RunState = z.enum(['ingest', 'extract', 'verify', 'synthesize', 'audit', 'done', 'error']);
export type RunState = z.infer<typeof RunState>;

export const BudgetStatus = z.enum(['ok', 'warning', 'degraded', 'halted']);
export type BudgetStatus = z.infer<typeof BudgetStatus>;

export const AgentRole = z.enum(['extractor', 'verifier', 'synthesis', 'orchestrator', 'trigger']);
export type AgentRole = z.infer<typeof AgentRole>;

// ============================================================
// DB ROW TYPES
// ============================================================

export const RunSchema = z.object({
  id: z.string().uuid(),
  source_url: z.string().url(),
  state: RunState,
  budget_usd: z.number(),
  budget_status: BudgetStatus,
  request_budget: z.number().int(),
  requests_used: z.number().int(),
  trust_density: z.number().nullable(),
  started_at: z.string(),
  completed_at: z.string().nullable(),
});
export type Run = z.infer<typeof RunSchema>;

export const ClaimSchema = z.object({
  id: z.string().uuid(),
  run_id: z.string().uuid(),
  source_sentence: z.string(),
  paraphrased_claim: z.string(),
  cited_source_raw: z.string().nullable(),
  cited_source_doi: z.string().nullable(),
  status: ClaimStatus,
  status_reason: z.string().nullable(),
  confidence: z.number().nullable(),
  evidence_url: z.string().nullable(),
  evidence_snippet: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const StateDiffSchema = z.object({
  id: z.string().uuid(),
  run_id: z.string().uuid(),
  claim_id: z.string().uuid().nullable(),
  agent_role: AgentRole,
  field_changed: z.string().nullable(),
  old_value: z.string().nullable(),
  new_value: z.string().nullable(),
  reason: z.string(),
  created_at: z.string(),
});
export type StateDiff = z.infer<typeof StateDiffSchema>;

export const HypothesisSchema = z.object({
  id: z.string().uuid(),
  run_id: z.string().uuid(),
  statement: z.string(),
  provenance: z.array(z.object({
    claim_id: z.string().uuid(),
    source_sentence: z.string(),
    doi: z.string().nullable(),
  })),
  rejected_claim_ids: z.array(z.string().uuid()).nullable(),
  created_at: z.string(),
});
export type Hypothesis = z.infer<typeof HypothesisSchema>;

export const AgentCallSchema = z.object({
  id: z.string().uuid(),
  run_id: z.string().uuid(),
  agent_role: AgentRole,
  claim_id: z.string().uuid().nullable(),
  model: z.string(),
  input_tokens: z.number().int(),
  output_tokens: z.number().int(),
  cost_usd: z.number(),
  latency_ms: z.number().int(),
  created_at: z.string(),
});
export type AgentCall = z.infer<typeof AgentCallSchema>;

// ============================================================
// AGENT INPUT/OUTPUT CONTRACTS
// No agent may pass these as strings to another agent.
// All inter-agent data flows through the claims table.
// ============================================================

// Extractor output → inserted directly into claims table
export const ExtractedClaimSchema = z.object({
  source_sentence: z.string(),
  paraphrased_claim: z.string(),
  cited_source_raw: z.string().nullable(),
});
export type ExtractedClaim = z.infer<typeof ExtractedClaimSchema>;

export const ExtractorOutputSchema = z.object({
  claims: z.array(ExtractedClaimSchema),
  reason: z.string().optional(), // present when claims is empty
});
export type ExtractorOutput = z.infer<typeof ExtractorOutputSchema>;

// Verifier output → written to claims row
export const VerifierVerdictSchema = z.object({
  claim_id: z.string().uuid(),
  status: z.enum(['confirmed', 'contradicted', 'unverifiable']),
  confidence: z.number().min(0).max(1).nullable(),
  status_reason: z.string(),
  evidence_url: z.string().nullable(),
  evidence_snippet: z.string().nullable(),
  cited_source_doi: z.string().nullable(),
  // Internal: not written to DB
  crossref_agreement: z.boolean().optional(),
  ss_agreement: z.boolean().optional(),
});
export type VerifierVerdict = z.infer<typeof VerifierVerdictSchema>;

// Synthesis output → written to hypotheses table
export const SynthesisOutputSchema = z.object({
  hypotheses: z.array(z.object({
    statement: z.string(),
    provenance: z.array(z.object({
      claim_id: z.string().uuid(),
      source_sentence: z.string(),
      doi: z.string().nullable(),
    })),
  })),
  refusals: z.array(z.object({
    attempted_hypothesis: z.string(),
    rejected_claim_ids: z.array(z.string().uuid()),
    reason: z.string(),
  })),
});
export type SynthesisOutput = z.infer<typeof SynthesisOutputSchema>;

// ============================================================
// OPENROUTER / LLM TYPES
// ============================================================

export const OpenRouterModel = z.enum([
  'openai/gpt-oss-20b:free',
  'nvidia/nemotron-3-ultra:free',
  'poolside/laguna-xs-2.1:free',
  'google/gemini-2.0-flash-exp:free',
]);
export type OpenRouterModel = z.infer<typeof OpenRouterModel>;

// Published list prices (per 1M tokens) for display purposes
// Actual spend is $0 on free tier
export const MODEL_LIST_PRICES: Record<string, { input: number; output: number }> = {
  'openai/gpt-oss-20b:free': { input: 0.15, output: 0.60 },
  'nvidia/nemotron-3-ultra:free': { input: 1.00, output: 1.00 },
  'poolside/laguna-xs-2.1:free': { input: 0.10, output: 0.10 },
  'google/gemini-2.0-flash-exp:free': { input: 0.00, output: 0.00 },
};

// ============================================================
// CROSSREF / SEMANTIC SCHOLAR TYPES
// ============================================================

export interface CrossRefWork {
  DOI: string;
  title: string[];
  abstract?: string;
  author?: Array<{ given: string; family: string }>;
  published?: { 'date-parts': number[][] };
  URL: string;
  publisher?: string;
  'container-title'?: string[];
}

export interface SemanticScholarPaper {
  paperId: string;
  title: string;
  abstract?: string;
  year?: number;
  venue?: string;
  externalIds?: { DOI?: string; ArXiv?: string };
  url?: string;
}

// ============================================================
// BUDGET / COST HELPERS
// ============================================================

export interface BudgetCheck {
  ok: boolean;
  status: BudgetStatus;
  requests_used: number;
  request_budget: number;
  message?: string;
}

export interface LogCallParams {
  run_id: string;
  agent_role: AgentRole;
  claim_id?: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
}
