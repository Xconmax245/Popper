-- ============================================================
-- POPPER — Database Triggers Migration 002
-- Run AFTER 001_initial_schema.sql
-- ============================================================

-- ============================================================
-- TRIGGER 1: BEFORE UPDATE — Lock unverifiable status permanently
-- This is a hard invariant: once a claim is 'unverifiable',
-- no code path (app OR manual SQL) can change its status.
-- This enforces Section 0, Principle 2 of the spec at the DB layer.
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_unverifiable_reversal()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'unverifiable' AND NEW.status IS DISTINCT FROM 'unverifiable' THEN
    RAISE EXCEPTION
      'Claim % is permanently unverifiable and cannot change status. Old: %, Attempted new: %',
      OLD.id, OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER claims_lock_unverifiable
BEFORE UPDATE ON claims
FOR EACH ROW
EXECUTE FUNCTION prevent_unverifiable_reversal();

-- ============================================================
-- TRIGGER 2: AFTER UPDATE — Audit log for status changes
-- Fires after every status change on claims → writes to state_diffs.
-- Agent role is 'trigger' to signal this was DB-generated, not app-generated.
-- Application code also writes to state_diffs (with its own agent_role)
-- for richer context — the trigger catches anything the app misses.
-- ============================================================
CREATE OR REPLACE FUNCTION log_claim_state_diff()
RETURNS trigger AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO state_diffs (
      run_id,
      claim_id,
      agent_role,
      field_changed,
      old_value,
      new_value,
      reason
    ) VALUES (
      NEW.run_id,
      NEW.id,
      'trigger',
      'status',
      OLD.status,
      NEW.status,
      COALESCE(NEW.status_reason, '[trigger: no reason provided by application]')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER claims_audit_status
AFTER UPDATE ON claims
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION log_claim_state_diff();

-- ============================================================
-- TRIGGER 3: AFTER UPDATE — Auto-update claims.updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER claims_updated_at
BEFORE UPDATE ON claims
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- REALTIME: Enable realtime on all dashboard tables
-- ============================================================
BEGIN;
  -- Add tables to the realtime publication
  -- (Supabase creates 'supabase_realtime' publication automatically)
  ALTER PUBLICATION supabase_realtime ADD TABLE claims;
  ALTER PUBLICATION supabase_realtime ADD TABLE state_diffs;
  ALTER PUBLICATION supabase_realtime ADD TABLE agent_calls;
  ALTER PUBLICATION supabase_realtime ADD TABLE runs;
  ALTER PUBLICATION supabase_realtime ADD TABLE hypotheses;
COMMIT;
