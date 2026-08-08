import { NextResponse } from 'next/server';
import { createRun } from '@/orchestrator/fsm';
import { z } from 'zod';

const CreateRunSchema = z.object({
  source_url: z.string().url('Must be a valid URL'),
  budget_usd: z.number().positive().max(10).optional(),
  request_budget: z.number().int().positive().max(50).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CreateRunSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const runId = await createRun({
      sourceUrl: parsed.data.source_url,
      budgetUsd: parsed.data.budget_usd,
      requestBudget: parsed.data.request_budget,
    });

    return NextResponse.json({ run_id: runId }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: 'POST to create a run' });
}
