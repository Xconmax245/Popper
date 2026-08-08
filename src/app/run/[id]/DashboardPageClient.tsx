'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { ClaimGraph } from '@/components/dashboard/ClaimGraph';
import { ExecutionTrace } from '@/components/dashboard/ExecutionTrace';
import { CostLedger } from '@/components/dashboard/CostLedger';
import { SourcesLedger } from '@/components/dashboard/SourcesLedger';
import { ClaimIntegrityReport } from '@/components/dashboard/ClaimIntegrityReport';
import type { Claim, StateDiff, AgentCall, Hypothesis, Run } from '@/types';
import {
  IconDownload, IconScan, IconScale, IconFlask, IconClipboard,
  IconCheck, IconWarning, IconDoc
} from '@/components/landing/icons';

const STATE_META: Record<string, { label: string; Icon: (p: { size?: number }) => JSX.Element }> = {
  ingest:     { label: 'Ingesting document',          Icon: IconDownload },
  extract:    { label: 'Extracting claims',        Icon: IconScan },
  verify:     { label: 'Verifying adversarially',  Icon: IconScale },
  synthesize: { label: 'Synthesizing hypotheses',  Icon: IconFlask },
  audit:      { label: 'Auditing run',             Icon: IconClipboard },
  done:       { label: 'Complete',                  Icon: IconCheck },
  error:      { label: 'Error',                     Icon: IconWarning },
};

interface DashboardPageClientProps {
  runId: string;
  initialRun: Run;
  initialClaims: Claim[];
  initialDiffs: StateDiff[];
  initialCalls: AgentCall[];
  initialHypotheses: Hypothesis[];
}

export function DashboardPageClient({
  runId,
  initialRun,
  initialClaims,
  initialDiffs,
  initialCalls,
  initialHypotheses,
}: DashboardPageClientProps) {
  const [run, setRun] = useState<Run>(initialRun);
  const [claims, setClaims] = useState<Claim[]>(initialClaims);
  const [diffs, setDiffs] = useState<StateDiff[]>(initialDiffs);
  const [calls, setCalls] = useState<AgentCall[]>(initialCalls);
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>(initialHypotheses);
  const [auditSummary] = useState<string | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();

    const claimsChannel = supabase.channel(`claims-${runId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'claims', filter: `run_id=eq.${runId}` }, (payload) => {
        const updated = payload.new as Claim;
        setClaims(prev => {
          const idx = prev.findIndex(c => c.id === updated.id);
          if (idx === -1) return [...prev, updated];
          const next = [...prev];
          next[idx] = updated;
          return next;
        });
      }).subscribe();

    const diffsChannel = supabase.channel(`diffs-${runId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'state_diffs', filter: `run_id=eq.${runId}` }, (payload) => {
        setDiffs(prev => [...prev, payload.new as StateDiff]);
      }).subscribe();

    const callsChannel = supabase.channel(`calls-${runId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_calls', filter: `run_id=eq.${runId}` }, (payload) => {
        setCalls(prev => [...prev, payload.new as AgentCall]);
      }).subscribe();

    const runsChannel = supabase.channel(`run-${runId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'runs', filter: `id=eq.${runId}` }, (payload) => {
        setRun(payload.new as Run);
      }).subscribe();

    const hypothesesChannel = supabase.channel(`hypotheses-${runId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hypotheses', filter: `run_id=eq.${runId}` }, (payload) => {
        setHypotheses(prev => [...prev, payload.new as Hypothesis]);
      }).subscribe();

    return () => {
      supabase.removeChannel(claimsChannel);
      supabase.removeChannel(diffsChannel);
      supabase.removeChannel(callsChannel);
      supabase.removeChannel(runsChannel);
      supabase.removeChannel(hypothesesChannel);
    };
  }, [runId]);

  const confirmedCount = claims.filter(c => c.status === 'confirmed').length;
  const contradictedCount = claims.filter(c => c.status === 'contradicted').length;
  const unverifiableCount = claims.filter(c => c.status === 'unverifiable').length;
  const total = claims.length;
  const trustDensity = run.trust_density ?? (total > 0 ? confirmedCount / total : 0);

  const uniqueSourcesCount = new Set(claims.map(c => c.evidence_url || c.cited_source_doi || c.cited_source_raw).filter(Boolean)).size;

  return (
    <div className="flex h-screen bg-[var(--dash-bg)] overflow-hidden font-sans text-[var(--dash-text)] dash-fade">
      
      {/* Main Content Area */}
      <div className="flex-1 h-screen overflow-y-auto relative">
        
        {/* Top Header */}
        <header className="h-[72px] bg-[var(--dash-surface)] border-b border-[var(--dash-border)] px-8 flex items-center justify-between shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-6">
            <a href="/" className="flex items-center gap-2 text-[var(--dash-text)] hover:opacity-80 transition-opacity">
              <Image src="/logo.png" alt="Popper" width={24} height={24} />
              <span className="font-['Synonym'] font-bold text-lg tracking-tight">Popper</span>
            </a>
            <div className="h-5 w-px bg-[var(--dash-border)]" />
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold text-[var(--dash-text-muted)]">Dashboard</span>
              <span className="text-[var(--dash-text-muted)]">/</span>
              <span className="text-[14px] font-bold text-[var(--dash-text)]">Run #{runId.slice(0, 8)}</span>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="p-8 max-w-[1400px] w-full mx-auto flex flex-col gap-8">
          
          {/* Summary Stats Row */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="dash-card p-5">
              <div className="text-[12px] font-bold text-[var(--dash-text-muted)] uppercase tracking-wider mb-2">Claim Status</div>
              <div className="flex items-center gap-2">
                <IconScale size={24} className={run.state === 'error' ? 'text-[var(--dash-red)]' : 'text-[var(--dash-green)]'} />
                <span className="text-2xl font-bold font-['Synonym']">
                  {run.state === 'done' ? 'Verified' : run.state === 'error' ? 'Error' : 'Processing'}
                </span>
              </div>
            </div>
            
            <div className="dash-card p-5">
              <div className="text-[12px] font-bold text-[var(--dash-text-muted)] uppercase tracking-wider mb-2">Sources Checked</div>
              <div className="flex items-center gap-2">
                <IconDoc size={24} className="text-[var(--dash-text-muted)]" />
                <span className="text-2xl font-bold font-['Synonym']">{uniqueSourcesCount}</span>
              </div>
            </div>

            <div className="dash-card p-5">
              <div className="text-[12px] font-bold text-[var(--dash-text-muted)] uppercase tracking-wider mb-2">Evidence Found</div>
              <div className="flex items-center gap-2">
                <IconClipboard size={24} className="text-[var(--dash-text-muted)]" />
                <span className="text-2xl font-bold font-['Synonym']">{claims.length}</span>
              </div>
            </div>

            <div className="dash-card p-5">
              <div className="text-[12px] font-bold text-[var(--dash-text-muted)] uppercase tracking-wider mb-2">Confidence</div>
              <div className="flex items-center gap-2">
                <IconCheck size={24} className="text-[var(--dash-green)]" />
                <span className="text-2xl font-bold font-['Synonym']">{(trustDensity * 100).toFixed(0)}%</span>
              </div>
            </div>

            <div className="dash-card p-5">
              <div className="text-[12px] font-bold text-[var(--dash-text-muted)] uppercase tracking-wider mb-2">Process</div>
              <div className={`flex items-center gap-2 font-medium ${
                run.state === 'done' ? 'text-[var(--dash-green-dark)]' :
                run.state === 'error' ? 'text-[var(--dash-red)]' :
                'text-[var(--dash-yellow)]'
              }`}>
                {(() => {
                  const meta = STATE_META[run.state];
                  const BadgeIcon = meta?.Icon;
                  return (
                    <div className="flex items-center gap-1.5" id="run-state-badge">
                      {BadgeIcon ? <BadgeIcon size={18} /> : null}
                      <span className="text-[14px] leading-tight">{meta?.label ?? run.state}</span>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Claim Bar */}
          <div className="dash-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--dash-surface-soft)]">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-[var(--dash-text-muted)] uppercase tracking-wider">Source Document</span>
              <a href={run.source_url} target="_blank" rel="noopener noreferrer" className="text-[15px] font-serif font-medium text-[var(--dash-text)] hover:text-[var(--dash-green-dark)] transition-colors truncate max-w-2xl">
                {run.source_url}
              </a>
            </div>
            <div className="flex gap-2">
              <span className="badge badge-green">{confirmedCount} Supports</span>
              <span className="badge badge-red">{contradictedCount} Contradicts</span>
              <span className="badge badge-yellow">{unverifiableCount} Unverified</span>
            </div>
          </div>

          {/* 3-Pane Workspace */}
          <div className="grid grid-cols-1 xl:grid-cols-[4fr_3fr_3fr] gap-6 xl:h-[calc(100vh-320px)] xl:min-h-[600px] min-h-[500px]">
            
            {/* Evidence Graph */}
            <div className="dash-card flex flex-col overflow-hidden min-h-0">
              <div className="px-5 py-4 border-b border-[var(--dash-border)] flex items-center justify-between bg-[var(--dash-surface)] z-10">
                <span className="dash-pane-title">Evidence Graph</span>
                <span className="text-[12px] text-[var(--dash-text-muted)] font-medium">Click a node to inspect</span>
              </div>
              <div className="flex-1 relative bg-[var(--dash-surface-soft)] min-h-[300px]">
                <ClaimGraph claims={claims} />
              </div>
            </div>

            {/* Trace Timeline */}
            <div className="dash-card flex flex-col overflow-hidden min-h-0">
              <div className="px-5 py-4 border-b border-[var(--dash-border)] flex items-center justify-between bg-[var(--dash-surface)] z-10">
                <span className="dash-pane-title">Trace Timeline</span>
                <span className="text-[12px] font-bold text-[var(--dash-green)]">{diffs.length} events</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 bg-[var(--dash-surface)]">
                <ExecutionTrace diffs={diffs} />
              </div>
            </div>

            {/* Sources & Cost Ledgers */}
            <div className="flex flex-col gap-6 h-full min-h-0">
              <div className="dash-card flex flex-col overflow-hidden flex-1 min-h-0">
                <div className="px-5 py-4 border-b border-[var(--dash-border)] bg-[var(--dash-surface)] z-10">
                  <span className="dash-pane-title">Sources Ledger</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 bg-[var(--dash-surface)]">
                  <SourcesLedger claims={claims} />
                </div>
              </div>
              
              <div className="dash-card flex flex-col overflow-hidden min-h-[300px]">
                <div className="px-5 py-4 border-b border-[var(--dash-border)] bg-[var(--dash-surface)] z-10">
                  <span className="dash-pane-title">Cost Ledger</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 bg-[var(--dash-surface)]">
                  <CostLedger calls={calls} run={run} />
                </div>
              </div>
            </div>

          </div>

          {/* Claim Integrity Report */}
          {run?.state === 'done' && (
            <div className="pt-8 pb-16 w-full max-w-[1000px] mx-auto">
              <ClaimIntegrityReport
                run={run}
                claims={claims}
                hypotheses={hypotheses}
                auditSummary={auditSummary}
              />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
