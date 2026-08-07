-- ============================================================
-- POPPER — Database Schema Migration 001
-- Run this in your Supabase project's SQL Editor
-- ============================================================

-- Enable UUID extension (usually already enabled in Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE: runs
-- The top-level FSM state container
-- ============================================================
CREATE TABLE IF NOT EXISTS runs (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url         text        NOT NULL,
  state              text        NOT NULL DEFAULT 'ingest'
                                 CHECK (state IN ('ingest','extract','verify','synthesize','audit','done','error')),
  budget_usd         numeric     NOT NULL DEFAULT 0.40,
  budget_status      text        NOT NULL DEFAULT 'ok'
                                 CHECK (budget_status IN ('ok','warning','degraded','halted')),
  request_budget     int         NOT NULL DEFAULT 45,
  requests_used      int         NOT NULL DEFAULT 0,
  trust_density      numeric,    -- computed at completion: confirmed / total
  started_at         timestamptz DEFAULT now(),
  completed_at       timestamptz
);

-- ============================================================
-- TABLE: claims
-- The Claim Graph — every inter-agent communication goes here
-- ============================================================
CREATE TABLE IF NOT EXISTS claims (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid        NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  source_sentence    text        NOT NULL,   -- exact sentence from source paper
  paraphrased_claim  text        NOT NULL,   -- normalized one-sentence claim
  cited_source_raw   text,                   -- citation as written in paper
  cited_source_doi   text,                   -- resolved DOI
  status             text        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending','confirmed','contradicted','unverifiable')),
  status_reason      text,                   -- required when status != 'pending'
  confidence         numeric     CHECK (confidence >= 0.0 AND confidence <= 1.0),
  evidence_url       text,
  evidence_snippet   text,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claims_run_id_idx ON claims(run_id);
CREATE INDEX IF NOT EXISTS claims_status_idx ON claims(status);

-- ============================================================
-- TABLE: state_diffs
-- Audit log — populated by Postgres triggers, NOT app code
-- This is the machine-readable execution trace
-- ============================================================
CREATE TABLE IF NOT EXISTS state_diffs (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid        NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  claim_id           uuid        REFERENCES claims(id),
  agent_role         text        NOT NULL
                                 CHECK (agent_role IN ('extractor','verifier','synthesis','orchestrator','trigger')),
  field_changed      text,
  old_value          text,
  new_value          text,
  reason             text        NOT NULL DEFAULT '',
  created_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS state_diffs_run_id_idx ON state_diffs(run_id);
CREATE INDEX IF NOT EXISTS state_diffs_created_at_idx ON state_diffs(created_at);

-- ============================================================
-- TABLE: hypotheses
-- Synthesis agent output — only from confirmed claims
-- ============================================================
CREATE TABLE IF NOT EXISTS hypotheses (
  id                   uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id               uuid      NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  statement            text      NOT NULL,
  provenance           jsonb     NOT NULL,  -- [{claim_id, source_sentence, doi}]
  rejected_claim_ids   uuid[],              -- claims Synthesis considered but rejected
  created_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hypotheses_run_id_idx ON hypotheses(run_id);

-- ============================================================
-- TABLE: agent_calls
-- Cost ledger — logged BEFORE response is processed
-- Dollar amounts are computed at published list price (actual spend $0)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_calls (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid        NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  agent_role         text        NOT NULL,
  claim_id           uuid        REFERENCES claims(id),
  model              text        NOT NULL,
  input_tokens       int         NOT NULL DEFAULT 0,
  output_tokens      int         NOT NULL DEFAULT 0,
  cost_usd           numeric     NOT NULL DEFAULT 0,  -- list-price equivalent, actual = $0
  latency_ms         int         NOT NULL DEFAULT 0,
  created_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_calls_run_id_idx ON agent_calls(run_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- Service role bypasses all (for server-side API routes)
-- Anon can SELECT for dashboard reads
-- ============================================================
ALTER TABLE runs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims       ENABLE ROW LEVEL SECURITY;
ALTER TABLE state_diffs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypotheses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_calls  ENABLE ROW LEVEL SECURITY;

-- Allow anon reads (dashboard subscribes without auth)
CREATE POLICY "anon_read_runs"        ON runs        FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_claims"      ON claims      FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_diffs"       ON state_diffs FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_hypotheses"  ON hypotheses  FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_calls"       ON agent_calls FOR SELECT TO anon USING (true);

-- Service role bypasses RLS automatically — no extra policy needed
-- (Supabase service_role key bypasses all RLS by design)
