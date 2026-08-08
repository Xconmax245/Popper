import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DashboardPageClient } from './DashboardPageClient';

interface PageProps {
  params: { id: string };
}

export default async function RunPage({ params }: PageProps) {
  const supabase = await createClient();
  const runId = params.id;

  const [runsRes, claimsRes, diffsRes, callsRes, hypRes] = await Promise.all([
    supabase.from('runs').select('*').eq('id', runId).single(),
    supabase.from('claims').select('*').eq('run_id', runId).order('created_at'),
    supabase.from('state_diffs').select('*').eq('run_id', runId).order('created_at'),
    supabase.from('agent_calls').select('*').eq('run_id', runId).order('created_at'),
    supabase.from('hypotheses').select('*').eq('run_id', runId),
  ]);

  if (runsRes.error || !runsRes.data) {
    notFound();
  }

  return (
    <DashboardPageClient
      runId={runId}
      initialRun={runsRes.data}
      initialClaims={claimsRes.data ?? []}
      initialDiffs={diffsRes.data ?? []}
      initialCalls={callsRes.data ?? []}
      initialHypotheses={hypRes.data ?? []}
    />
  );
}

export async function generateMetadata({ params }: PageProps) {
  return {
    title: `Run ${params.id.slice(0, 8)} — Popper Claim Verification`,
    description: 'Live adversarial claim verification dashboard. Track every verdict in real time.',
  };
}
