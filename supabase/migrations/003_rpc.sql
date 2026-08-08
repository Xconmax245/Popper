-- Add to your Supabase SQL Editor after running 002_triggers.sql
-- This RPC is called by openrouter.ts to atomically increment requests_used

CREATE OR REPLACE FUNCTION increment_requests_used(run_id uuid)
RETURNS void AS $$
  UPDATE runs SET requests_used = requests_used + 1 WHERE id = run_id;
$$ LANGUAGE sql SECURITY DEFINER;
