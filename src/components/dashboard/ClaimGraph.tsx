'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Claim } from '@/types';
import { IconX } from '@/components/landing/icons';


// d3-force for layout calculation only — React/Framer Motion owns the rendering
import * as d3Force from 'd3-force';

interface ClaimNode {
  id: string;
  claim?: Claim;
  isHub?: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
}

const STATUS_COLORS = {
  pending: { fill: 'var(--dash-surface-soft)', border: 'var(--dash-border)', text: 'var(--dash-text-secondary)', label: 'Pending' },
  confirmed: { fill: 'var(--dash-green)', border: 'var(--dash-green-border)', text: '#FFFFFF', label: 'Confirmed' },
  contradicted: { fill: 'var(--dash-red)', border: 'var(--dash-red-border)', text: '#FFFFFF', label: 'Contradicted' },
  unverifiable: { fill: 'var(--dash-yellow)', border: 'var(--dash-yellow-border)', text: 'var(--dash-text)', label: 'Unverifiable' },
} as const;

interface ClaimGraphProps {
  claims: Claim[];
  width?: number;
  height?: number;
}

export function ClaimGraph({ claims, width: initialWidth = 800, height: initialHeight = 600 }: ClaimGraphProps) {
  const [nodes, setNodes] = useState<ClaimNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: initialWidth, height: initialHeight });
  const simulationRef = useRef<d3Force.Simulation<ClaimNode, undefined> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Responsive observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        if (entry.contentRect.width && entry.contentRect.height) {
          setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Initialize or update simulation when claims change
  useEffect(() => {
    if (claims.length === 0) {
      setNodes([]);
      if (simulationRef.current) simulationRef.current.stop();
      return;
    }

    const existingNodes = new Map(nodes.map(n => [n.id, n]));

    const { width, height } = dimensions;

    const hubNode: ClaimNode = {
      id: 'hub',
      isHub: true,
      x: width / 2,
      y: height / 2,
      vx: 0,
      vy: 0,
      fx: width / 2,
      fy: height / 2,
    };

    const claimNodes: ClaimNode[] = claims.map(claim => {
      const existing = existingNodes.get(claim.id);
      return {
        id: claim.id,
        claim,
        x: existing?.x ?? width / 2 + (Math.random() - 0.5) * 150,
        y: existing?.y ?? height / 2 + (Math.random() - 0.5) * 150,
        vx: existing?.vx ?? 0,
        vy: existing?.vy ?? 0,
      };
    });

    const newNodes = [hubNode, ...claimNodes];
    const links = claimNodes.map(cn => ({ source: 'hub', target: cn.id }));

    if (simulationRef.current) simulationRef.current.stop();

    const sim = d3Force.forceSimulation<ClaimNode>(newNodes)
      .force('link', d3Force.forceLink<ClaimNode, { source: string; target: string }>(links).id((d) => d.id).distance(120))
      .force('charge', d3Force.forceManyBody().strength(-250))
      .force('center', d3Force.forceCenter(dimensions.width / 2, dimensions.height / 2))
      .force('collision', d3Force.forceCollide<ClaimNode>().radius((d) => d.id === 'hub' ? 40 : 30))
      .alphaDecay(0.03)
      .on('tick', () => {
        setNodes(prev => {
          return newNodes.map(simNode => {
            const current = prev.find(p => p.id === simNode.id);
            if (!current) return { ...simNode };
            return { ...current, x: simNode.x, y: simNode.y };
          });
        });
      });

    simulationRef.current = sim;
    setNodes(newNodes);

    return () => { sim.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claims.length, dimensions.width, dimensions.height]);

  useEffect(() => {
    if (claims.length === 0) return;
    setNodes(prev => prev.map(n => {
      if (n.isHub) return n;
      const updated = claims.find(c => c.id === n.id);
      if (!updated) return n;
      return { ...n, claim: updated };
    }));
  }, [claims]);

  const selectedClaim = selectedId ? claims.find(c => c.id === selectedId) : null;
  const handleNodeClick = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id);
  }, []);

  const hubNode = nodes.find(n => n.isHub);
  const claimNodes = nodes.filter(n => !n.isHub);

  return (
    <div className="relative w-full h-full bg-transparent flex items-center justify-center overflow-hidden">
      
      {claims.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-0">
          <div className="relative w-32 h-32 flex items-center justify-center">
            <motion.div
              animate={{ opacity: [0.3, 0.6, 0.3], scale: [0.95, 1.05, 0.95] }}
              transition={{ duration: 2, ease: "easeInOut", repeat: Infinity }}
              className="w-16 h-16 rounded-full border-2 border-[var(--dash-border-default)] bg-[var(--dash-surface-raised)]"
            />
            <motion.div
              animate={{ opacity: [0.1, 0.2, 0.1], y: [0, -5, 0] }}
              transition={{ duration: 2.5, ease: "easeInOut", repeat: Infinity, delay: 0.2 }}
              className="absolute -top-4 -left-8 w-12 h-12 rounded-full border-2 border-dashed border-[var(--dash-text-secondary)] bg-[var(--dash-surface)]"
            />
            <motion.div
              animate={{ opacity: [0.15, 0.25, 0.15], x: [0, 5, 0] }}
              transition={{ duration: 2.2, ease: "easeInOut", repeat: Infinity, delay: 0.8 }}
              className="absolute top-2 -right-10 w-12 h-12 rounded-full border-2 border-dashed border-[var(--dash-text-secondary)] bg-[var(--dash-surface)]"
            />
            <motion.div
              animate={{ opacity: [0.1, 0.2, 0.1], y: [0, 5, 0] }}
              transition={{ duration: 2.7, ease: "easeInOut", repeat: Infinity, delay: 1.4 }}
              className="absolute -bottom-8 left-6 w-12 h-12 rounded-full border-2 border-dashed border-[var(--dash-text-secondary)] bg-[var(--dash-surface)]"
            />
          </div>
          <span className="mt-8 text-[13px] text-[var(--dash-text-secondary)] font-medium">
            Waiting for claims to be extracted…
          </span>
        </div>
      )}

      {claims.length > 0 && hubNode && (
        <svg className="absolute inset-0 pointer-events-none z-0" width="100%" height="100%">
          {claimNodes.map(node => (
            <motion.line
              key={`edge-${node.id}`}
              x1={hubNode.x}
              y1={hubNode.y}
              x2={node.x}
              y2={node.y}
              stroke="var(--dash-green)"
              strokeWidth="1.5"
              animate={{ x1: hubNode.x, y1: hubNode.y, x2: node.x, y2: node.y }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          ))}
        </svg>
      )}

      <div ref={containerRef} className="absolute inset-0 z-10">
        <AnimatePresence>
          {nodes.map(node => {
            if (node.isHub) {
              return (
                <motion.div
                  key="hub"
                  className="absolute flex items-center justify-center rounded-full bg-[var(--dash-green)] border-[3px] border-white shadow-[0_6px_20px_rgba(8,184,107,0.25)] z-20"
                  style={{ width: 64, height: 64, left: node.x - 32, top: node.y - 32 }}
                  animate={{ left: node.x - 32, top: node.y - 32 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </motion.div>
              );
            }

            if (!node.claim) return null;

            const colors = STATUS_COLORS[node.claim.status];
            const isSelected = selectedId === node.id;

            return (
              <motion.button
                key={node.id}
                id={`claim-node-${node.id}`}
                className="absolute flex flex-col items-center justify-center rounded-full cursor-pointer focus:outline-none"
                style={{
                  width: 48,
                  height: 48,
                  left: node.x - 24,
                  top: node.y - 24,
                  backgroundColor: colors.fill,
                  border: `2px solid ${colors.border}`,
                  color: colors.text,
                  zIndex: isSelected ? 30 : 15,
                }}
                animate={{
                  backgroundColor: colors.fill,
                  borderColor: colors.border,
                  scale: isSelected ? 1.15 : 1,
                  left: node.x - 24,
                  top: node.y - 24,
                  boxShadow: isSelected
                    ? `0 0 0 4px ${colors.border}44, 0 8px 24px ${colors.fill}88`
                    : `0 4px 12px ${colors.fill}44`,
                }}
                whileHover={{ scale: isSelected ? 1.15 : 1.08, borderColor: '#ffffff' }}
                whileTap={{ scale: 0.95 }}
                transition={{
                  backgroundColor: { duration: 0.4, ease: 'easeInOut' },
                  borderColor: { duration: 0.2 },
                  scale: { type: 'spring', stiffness: 300, damping: 20 },
                  left: { type: 'spring', stiffness: 300, damping: 30 },
                  top: { type: 'spring', stiffness: 300, damping: 30 },
                }}
                onClick={() => handleNodeClick(node.id)}
                title={node.claim.paraphrased_claim}
              >
                {node.claim.status === 'confirmed' && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                )}
                {node.claim.status === 'contradicted' && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                )}
                {node.claim.status === 'unverifiable' && (
                  <span className="font-bold text-[16px]">?</span>
                )}
                {node.claim.status === 'pending' && (
                  <span className="w-2 h-2 rounded-full bg-[var(--dash-text-muted)] animate-pulse"></span>
                )}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {selectedClaim && (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="absolute right-0 top-0 bottom-0 w-80 bg-[var(--dash-surface)] border-l border-[var(--dash-border)] overflow-y-auto p-5 z-40 shadow-[-10px_0_30px_rgba(0,0,0,0.05)]"
          >
            <div className="flex items-start justify-between mb-4">
              <span
                className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider"
                style={{
                  backgroundColor: STATUS_COLORS[selectedClaim.status].fill,
                  color: STATUS_COLORS[selectedClaim.status].text,
                }}
              >
                {STATUS_COLORS[selectedClaim.status].label}
                {selectedClaim.confidence !== null && ` · ${Math.round((selectedClaim.confidence ?? 0) * 100)}%`}
              </span>
              <button
                onClick={() => setSelectedId(null)}
                className="text-[var(--dash-text-secondary)] hover:text-[var(--dash-text-primary)] inline-flex items-center justify-center transition-colors -mt-1 -mr-1 p-1"
                aria-label="Close detail"
              ><IconX size={18} /></button>
            </div>

            <h3 className="text-[14px] font-medium text-[var(--dash-text-primary)] mb-3 leading-snug">
              {selectedClaim.paraphrased_claim}
            </h3>

            <p className="text-[13px] text-[var(--dash-text-secondary)] italic mb-4 leading-relaxed border-l-2 border-[var(--dash-border-default)] pl-3 py-0.5">
              &ldquo;{selectedClaim.source_sentence}&rdquo;
            </p>

            {selectedClaim.status_reason && (
              <div className="mb-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--dash-text-tertiary)] mb-1.5">Verdict Reason</p>
                <p className="text-[13px] text-[var(--dash-text-primary)] leading-relaxed bg-[var(--dash-surface)] border border-[var(--dash-border-subtle)] rounded-lg p-3">
                  {selectedClaim.status_reason}
                </p>
              </div>
            )}

            {selectedClaim.evidence_snippet && (
              <div className="mb-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--dash-text-tertiary)] mb-1.5">Evidence</p>
                <p className="text-[13px] text-[var(--dash-text-primary)] leading-relaxed bg-[var(--dash-surface)] border border-[var(--dash-border-subtle)] rounded-lg p-3">
                  {selectedClaim.evidence_snippet}
                </p>
              </div>
            )}

            {selectedClaim.cited_source_raw && (
              <div className="mb-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--dash-text-tertiary)] mb-1.5">Citation</p>
                <p className="text-[13px] text-[var(--dash-text-secondary)]">
                  {selectedClaim.cited_source_raw}
                </p>
              </div>
            )}

            {selectedClaim.evidence_url && (
              <a
                href={selectedClaim.evidence_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--dash-confirmed)] hover:underline mt-2"
              >
                View source material →
              </a>
            )}

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

