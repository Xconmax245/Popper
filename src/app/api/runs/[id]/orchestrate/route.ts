import { NextResponse } from 'next/server';
import { runFSM } from '@/orchestrator/fsm';

// maxDuration: allow up to 5 minutes for a full verification run
// This is explicitly configured to avoid Vercel's default 10s timeout
// killing the pipeline mid-demo.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const runId = params.id;

  try {
    // Run the FSM. This is a long-running operation (verified by maxDuration above).
    // The FSM writes all state transitions to DB as it runs.
    // The dashboard subscribes to Realtime and sees updates in real time.
    await runFSM(runId);
    return NextResponse.json({ status: 'complete', run_id: runId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, run_id: runId }, { status: 500 });
  }
}
