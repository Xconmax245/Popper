'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import type { AgentCall, Run } from '@/types';
import { IconWarning } from '@/components/landing/icons';


const ROLE_COLORS: Record<string, string> = {
  extractor: 'var(--dash-text-secondary)',
  verifier: 'var(--dash-yellow)', // Amber
  synthesis: 'var(--dash-green)', // Green
  orchestrator: 'var(--dash-text)', // Neutral
};


interface CostLedgerProps {
  calls: AgentCall[];
  run: Run;
}

export function CostLedger({ calls, run }: CostLedgerProps) {
  const { totalCost, byRole, byClaim, requestPct } = useMemo(() => {
    const totalCost = calls.reduce((s, c) => s + c.cost_usd, 0);

    const byRoleMap: Record<string, { cost: number; count: number }> = {};
    for (const c of calls) {
      if (!byRoleMap[c.agent_role]) byRoleMap[c.agent_role] = { cost: 0, count: 0 };
      byRoleMap[c.agent_role].cost += c.cost_usd;
      byRoleMap[c.agent_role].count += 1;
    }

    const byRole = Object.entries(byRoleMap).map(([role, { cost, count }]) => ({
      role,
      cost,
      count,
      label: role.charAt(0).toUpperCase() + role.slice(1),
    }));

    const byClaimMap: Record<string, { cost: number; count: number }> = {};
    for (const c of calls) {
      if (!c.claim_id) continue;
      if (!byClaimMap[c.claim_id]) byClaimMap[c.claim_id] = { cost: 0, count: 0 };
      byClaimMap[c.claim_id].cost += c.cost_usd;
      byClaimMap[c.claim_id].count += 1;
    }
    const byClaim = Object.entries(byClaimMap)
      .map(([claimId, { cost, count }]) => ({ claimId, cost, count }))
      .sort((a, b) => b.cost - a.cost);

    const requestPct = run.request_budget > 0
      ? (run.requests_used / run.request_budget) * 100
      : 0;

    return { totalCost, byRole, byClaim, requestPct };
  }, [calls, run]);

  const budgetStatus = run.budget_status;
  const bannerVisible = budgetStatus === 'warning' || budgetStatus === 'degraded' || budgetStatus === 'halted';

  return (
    <div className="space-y-4">
      {/* Budget Status Banner */}
      <AnimatePresence>
        {bannerVisible && (
          <motion.div
            key="budget-banner"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={`rounded-lg px-4 py-3 text-[13px] font-semibold border ${
              budgetStatus === 'warning'
                ? 'bg-[var(--dash-unverifiable)]/10 border-[var(--dash-unverifiable)]/30 text-[var(--dash-unverifiable)]'
                : 'bg-[var(--dash-red)]/10 border-[var(--dash-red)]/30 text-[var(--dash-red)]'
            }`}
            id="budget-status-banner"
          >
            <span className="inline-flex items-start gap-2">
              <IconWarning size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                {budgetStatus === 'warning' && 'Approaching request budget — degrading verification depth (CrossRef only)'}
                {budgetStatus === 'degraded' && 'Request budget reached — remaining claims marked unverifiable'}
                {budgetStatus === 'halted' && 'Pipeline halted — budget exhausted'}
              </span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List-price equivalent cost stat card */}
      <div className="bg-[var(--dash-surface)] border border-[var(--dash-border)] rounded-lg p-5 flex flex-col items-center justify-center text-center">
        <div className="text-3xl font-bold font-['Synonym'] text-[var(--dash-text)] tracking-tight">
          ${totalCost.toFixed(4)}
        </div>
        <div className="text-[12px] text-[var(--dash-text-secondary)] mt-1.5 flex flex-col">
          <span>List-price equivalent</span>
          <span className="text-[11px] text-[var(--dash-text-muted)] uppercase tracking-wider mt-0.5">Actual: $0.00 (free tier)</span>
        </div>
      </div>

      {/* Request Budget Progress */}
      <div>
        <div className="flex justify-between text-[11px] text-[var(--dash-text-secondary)] font-bold uppercase tracking-wider mb-2">
          <span>Request Budget</span>
          <span>{run.requests_used} / {run.request_budget}</span>
        </div>
        <div className="w-full bg-[var(--dash-border)] rounded-full h-2 overflow-hidden">
          <motion.div
            className={`h-2 rounded-full transition-colors ${
              requestPct >= 100 ? 'bg-[var(--dash-red)]' :
              requestPct >= 80 ? 'bg-[var(--dash-unverifiable)]' : 'bg-[var(--dash-green)]'
            }`}
            animate={{ width: `${Math.min(requestPct, 100)}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      </div>

      {/* Bar chart by role */}
      {byRole.length > 0 && (
        <div>
          <div className="text-[11px] text-[var(--dash-text-muted)] mb-2 font-bold uppercase tracking-wider">Cost by Agent</div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={byRole} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <XAxis dataKey="label" tick={{ fill: 'var(--dash-text-secondary)', fontSize: 10 }} />
              <YAxis hide />
              <Tooltip
                cursor={{ fill: 'var(--dash-surface)' }}
                contentStyle={{ backgroundColor: 'var(--dash-surface)', border: '1px solid var(--dash-border)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--dash-text)', fontSize: 11, fontWeight: 'bold' }}
                itemStyle={{ fontSize: 12, color: 'var(--dash-text-secondary)' }}
                formatter={(value) => [`$${Number(value).toFixed(6)}`, 'Cost']}
              />
              <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                {byRole.map(entry => (
                  <Cell key={entry.role} fill={ROLE_COLORS[entry.role] ?? 'var(--dash-text-muted)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-claim cost table */}
      {byClaim.length > 0 && (
        <div>
          <div className="text-[11px] text-[var(--dash-text-muted)] mb-2 font-bold uppercase tracking-wider">Cost by Claim</div>
          <div className="space-y-1 max-h-48 overflow-y-auto pr-2">
            {byClaim.map(({ claimId, cost, count }) => (
              <div key={claimId} className="flex justify-between text-[13px] py-2 border-b border-[var(--dash-border)]">
                <span className="text-[var(--dash-text-secondary)] font-mono truncate max-w-[60%]">
                  {claimId.slice(0, 8)}…
                </span>
                <span className="text-[var(--dash-text)] font-medium">
                  ${cost.toFixed(6)} <span className="text-[var(--dash-text-muted)] font-normal">({count} call{count > 1 ? 's' : ''})</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {calls.length === 0 && (
        <div className="text-center text-[var(--dash-text-secondary)] text-[13px] py-4">No calls logged yet</div>
      )}

    </div>
  );
}
