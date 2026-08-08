'use client';

import type { Claim } from '@/types';

interface SourcesLedgerProps {
  claims: Claim[];
}

export function SourcesLedger({ claims }: SourcesLedgerProps) {
  // Extract unique sources. Claims with the same DOI or evidence_url or cited_source_raw are grouped.
  // We'll just list claims that have a source to keep it simple, or group them.
  // Grouping by evidence_url or cited_source_raw
  
  const sourcesMap = new Map<string, {
    raw: string;
    doi: string | null;
    url: string | null;
    claims: Claim[];
  }>();

  for (const c of claims) {
    if (!c.cited_source_raw && !c.evidence_url) continue;
    
    // Create a composite key
    const key = c.evidence_url || c.cited_source_doi || c.cited_source_raw || c.id;
    
    if (!sourcesMap.has(key)) {
      sourcesMap.set(key, {
        raw: c.cited_source_raw || 'Unknown Source',
        doi: c.cited_source_doi,
        url: c.evidence_url,
        claims: []
      });
    }
    sourcesMap.get(key)!.claims.push(c);
  }

  const uniqueSources = Array.from(sourcesMap.values());

  if (uniqueSources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <span className="text-[13px] text-[var(--dash-text-secondary)] font-medium mt-4">No sources analyzed yet…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-y-auto max-h-full pr-1">
      {uniqueSources.map((source, idx) => {
        // Aggregate statuses for this source
        const statuses = new Set(source.claims.map(c => c.status));
        
        let badgeColor = 'badge-neutral';
        let badgeText = 'Analyzed';
        
        if (statuses.has('contradicted')) {
          badgeColor = 'badge-red';
          badgeText = 'Contradicts';
        } else if (statuses.has('confirmed')) {
          badgeColor = 'badge-green';
          badgeText = 'Supports';
        } else if (statuses.has('unverifiable')) {
          badgeColor = 'badge-yellow';
          badgeText = 'Unverified';
        }

        return (
          <div key={idx} className="bg-[var(--dash-surface)] rounded-lg p-4 flex flex-col gap-3 border border-[var(--dash-border)]">
            <div className="flex items-start gap-3 justify-between">
              <span className={`badge ${badgeColor} shrink-0 mt-0.5`}>
                {badgeText}
              </span>
              <span className="text-[13px] text-[var(--dash-text)] leading-relaxed font-serif font-medium flex-1">
                {source.raw}
              </span>
            </div>
            
            {(source.url || source.doi) && (
              <div className="flex items-center gap-4 text-[11px] font-mono text-[var(--dash-text-muted)] ml-[86px]">
                {source.doi && <span>DOI: {source.doi}</span>}
                {source.url && (
                  <a href={source.url} target="_blank" rel="noreferrer" className="text-[var(--dash-green)] hover:underline flex items-center gap-1">
                    View Document <span aria-hidden="true">↗</span>
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
