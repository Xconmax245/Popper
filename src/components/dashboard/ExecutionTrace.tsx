'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StateDiff } from '@/types';
import { IconScan } from '@/components/landing/icons';

interface ExecutionTraceProps {
  diffs: StateDiff[];
}

/**
 * Maps a trace event to a visual tone so a failing run is obvious at a glance.
 * LLM-call lifecycle events (dispatched/responded/parsed/failed/timed_out/
 * budget_halted) get distinct treatment:
 *   alarm    — the call broke. Red dot + red-tinted row + red title.
 *   warn     — budget blocked the call before dispatch. Amber dot.
 *   progress — request is in flight / intermediate state. Cyan dot.
 *   normal   — everything else (verdicts, transitions, parsed results).
 */
type Tone = 'alarm' | 'warn' | 'progress' | 'normal';

const FIELD_TONE: Record<string, Tone> = {
  failed: 'alarm',
  timed_out: 'alarm',
  parse_error: 'alarm',
  budget_halted: 'warn',
  degraded_single_source: 'warn', // D12: budget-degraded verification renders amber, not gray
  dispatched: 'progress',
  responded: 'progress',
};

function toneFor(field: string | null, newValue: string | null): Tone {
  // A transition INTO the error state is an alarm regardless of which field
  // carried it. This is the row the FSM writes when it routes an IngestError or
  // LlmCallError to runs.state='error' — it must never render as a green
  // "verdict", or a failed run would look just like a successful one.
  if (newValue === 'error') return 'alarm';
  if (field && FIELD_TONE[field]) return FIELD_TONE[field];
  return 'normal';
}

// Only references CSS variables that actually exist in globals.css. Undefined
// vars silently drop the color, so warn/progress use existing tokens (the dark yellow
// literal matches the existing .badge-yellow text convention).
const TONE_STYLES: Record<Tone, { dot: string; title: string; row: string }> = {
  alarm: {
    dot: 'border-[var(--dash-red)] bg-[var(--dash-red)]',
    title: 'text-[var(--dash-red)]',
    row: 'bg-[var(--dash-red-soft)] rounded-lg -mx-2 px-2 py-1',
  },
  warn: {
    dot: 'border-[var(--dash-yellow)] bg-[var(--dash-yellow)]',
    title: 'text-[var(--dash-yellow-dark)]',
    row: '',
  },
  progress: {
    dot: 'border-[var(--dash-text-muted)] bg-[var(--dash-text-muted)]',
    title: 'text-[var(--dash-text-secondary)]',
    row: '',
  },
  normal: {
    dot: 'border-[var(--dash-green)]',
    title: 'text-[var(--dash-text)]',
    row: '',
  },
};

export function ExecutionTrace({ diffs }: ExecutionTraceProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest entry
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [diffs.length]);

  if (diffs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="w-12 h-12 mb-3 rounded-full border-2 border-[var(--dash-border)] flex items-center justify-center">
          <IconScan size={20} className="text-[var(--dash-text-muted)]" />
        </div>
        <span className="text-[13px] text-[var(--dash-text-secondary)] font-medium">Waiting for agent activity…</span>
      </div>
    );
  }

  return (
    <div className="relative pl-4 space-y-6 overflow-y-auto max-h-full py-2 pr-2" id="execution-trace-feed">
      {/* The vertical timeline line */}
      <div className="absolute left-[21px] top-4 bottom-4 w-px bg-[var(--dash-green)] opacity-30" />

      <AnimatePresence initial={false}>
        {diffs.map((diff, i) => {
          const ts = new Date(diff.created_at).toLocaleTimeString('en-US', {
            hour12: true,
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
          });

          // ── B6: SYNTHESIS REJECTION BADGE ─────────────────────────────────────
          // Fires BEFORE the isVerdict check so it can never be green-styled.
          // Visually distinct enough to read as a deliberate system act without narration.
          if (diff.field_changed === 'claim_rejected' && diff.new_value === 'rejected_by_synthesis') {
            return (
              <motion.div
                key={diff.id}
                id={`trace-${diff.id}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut', delay: i * 0.05 }}
                className="relative pl-6"
              >
                {/* Red timeline dot */}
                <div className="absolute left-[-1.1rem] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--dash-red)] bg-[var(--dash-red)]" />

                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-mono text-[11px] text-[var(--dash-text-muted)] whitespace-nowrap">{ts}</span>
                </div>

                <div className="flex items-start gap-2 rounded-md border border-[var(--dash-red)] bg-[var(--dash-red-soft)] px-3 py-2 mt-1">
                  <span className="font-bold text-[var(--dash-red)] text-xs tracking-wide uppercase whitespace-nowrap shrink-0 mt-0.5">
                    ✕ REJECTED BY SYNTHESIS
                  </span>
                  <span className="text-sm text-[var(--dash-text-secondary)] leading-relaxed">{diff.reason}</span>
                </div>
              </motion.div>
            );
          }
          // ── END SYNTHESIS REJECTION BADGE ─────────────────────────────────────

          // Format a nice title
          let title = (diff.field_changed || diff.agent_role).replace(/_/g, ' ');
          title = title.charAt(0).toUpperCase() + title.slice(1);

          const tone = toneFor(diff.field_changed, diff.new_value);
          const styles = TONE_STYLES[tone];

          // "Verdict" = the green happy-path treatment. A row only earns it when
          // its tone is otherwise normal, so an error/failed/timed_out row keeps
          // its alarm styling instead of being overridden to green here.
          // NOTE: claim_rejected is excluded here because rejected_by_synthesis
          // is handled above; other claim_rejected values (non-synthesis) can
          // fall through to the normal verdict path.
          const isVerdict = tone === 'normal' && (
            diff.field_changed === 'hypothesis_accepted' ||
            diff.field_changed === 'run_state'
          );

          const changeText = diff.field_changed
            ? diff.old_value !== null && diff.new_value !== null && diff.old_value !== 'n/a' && diff.old_value !== 'null'
              ? `${diff.old_value} → ${diff.new_value}`
              : diff.new_value ?? diff.old_value
            : null;

          return (
            <motion.div
              key={diff.id}
              id={`trace-${diff.id}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut', delay: i * 0.05 }}
              className={`relative pl-6 ${styles.row}`}
            >
              {/* Timeline dot */}
              <div
                className={`absolute left-[-1.1rem] top-1.5 w-2.5 h-2.5 rounded-full border-2 bg-white ${isVerdict ? 'border-[var(--dash-green)] bg-[var(--dash-green)]' : styles.dot}`}
              />

              <div className="flex items-start justify-between gap-4 mb-1">
                <span className={`text-[14px] font-semibold tracking-wide ${isVerdict ? 'text-[var(--dash-green-dark)]' : styles.title}`}>
                  {title}
                </span>
                <span className="font-mono text-[11px] text-[var(--dash-text-muted)] whitespace-nowrap mt-0.5">{ts}</span>
              </div>

              <div className="text-[13px] text-[var(--dash-text-secondary)] leading-relaxed flex flex-col gap-1">
                {changeText && changeText !== 'rejected_by_synthesis' && changeText !== 'hypothesis_refused' && changeText !== 'refused' && (
                  <span className="font-mono text-[12px] text-[var(--dash-text-muted)] truncate block max-w-full">
                    {changeText}
                  </span>
                )}
                {diff.reason && <span>{diff.reason}</span>}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      <div ref={bottomRef} className="h-2" />
    </div>
  );
}
