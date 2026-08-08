import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const runId = params.id;

  const [runsRes, claimsRes, diffsRes, hypothesesRes, callsRes] = await Promise.all([
    supabase.from('runs').select('*').eq('id', runId).single(),
    supabase.from('claims').select('*').eq('run_id', runId).order('created_at'),
    supabase.from('state_diffs').select('*').eq('run_id', runId).order('created_at'),
    supabase.from('hypotheses').select('*').eq('run_id', runId),
    supabase.from('agent_calls').select('*').eq('run_id', runId).order('created_at'),
  ]);

  if (runsRes.error || !runsRes.data) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  // Cost summary by role
  const calls = callsRes.data ?? [];
  const costByRole = calls.reduce((acc: Record<string, number>, c: { agent_role: string; cost_usd: number }) => {
    acc[c.agent_role] = (acc[c.agent_role] ?? 0) + c.cost_usd;
    return acc;
  }, {});

  return NextResponse.json({
    run: runsRes.data,
    claims: claimsRes.data ?? [],
    state_diffs: diffsRes.data ?? [],
    hypotheses: hypothesesRes.data ?? [],
    agent_calls: callsRes.data ?? [],
    cost_summary: {
      total_usd: calls.reduce((s: number, c: { cost_usd: number }) => s + c.cost_usd, 0),
      by_role: costByRole,
      total_requests: (runsRes.data as { requests_used: number }).requests_used,
    },
  });
}
