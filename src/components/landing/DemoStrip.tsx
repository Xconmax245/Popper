'use client';

import { useState } from 'react';
import { Reveal } from './Cinematic';
import { IconScan, IconScale, IconCheck, IconWarning, IconChain } from './icons';

type Verdict = 'confirmed' | 'contradicted' | 'unverifiable';

const CLAIMS: Record<'extract' | 'verify', {
  text: string;
  verdict: Verdict;
  note: string;
}[]> = {
  extract: [
    { text: 'Model reaches 94.2% accuracy on ImageNet-1k.', verdict: 'confirmed', note: 'Claim #1 · extracted from §4.2' },
    { text: 'Training required 3.5x less compute than baseline.', verdict: 'confirmed', note: 'Claim #2 · extracted from §5' },
    { text: 'Method generalises to unseen medical imaging.', verdict: 'unverifiable', note: 'Claim #3 · extracted from §6' },
    { text: 'Outperforms all prior work on every benchmark.', verdict: 'contradicted', note: 'Claim #4 · extracted from abstract' },
  ],
  verify: [
    { text: '94.2% accuracy matches cited leaderboard entry.', verdict: 'confirmed', note: 'Verified against 2 sources' },
    { text: 'Compute claim supported by appendix + repo.', verdict: 'confirmed', note: 'Verified against 3 sources' },
    { text: 'No citation found for medical generalisation.', verdict: 'unverifiable', note: 'Refusal logged' },
    { text: 'Prior work reports higher score on COCO.', verdict: 'contradicted', note: 'Counter-evidence: 1 source' },
  ],
};

const VERDICT_META: Record<Verdict, { color: string; label: string; Icon: typeof IconCheck }> = {
  confirmed:    { color: 'var(--confirmed)',    label: 'Confirmed',    Icon: IconCheck },
  contradicted: { color: 'var(--contradicted)', label: 'Contradicted', Icon: IconWarning },
  unverifiable: { color: 'var(--unverifiable)', label: 'Unverifiable', Icon: IconChain },
};

export function DemoStrip() {
  const [tab, setTab] = useState<'extract' | 'verify'>('verify');
  const rows = CLAIMS[tab];

  return (
    <section id="how" className="section bg-grey" data-aos="fade-up" data-aos-duration="800">
      <div className="container">
        <Reveal className="text-center">
          <span className="eyebrow">See it work</span>
          <h2 className="heading">
            Watch a paper get <span className="accent">cross-examined</span>
          </h2>
        </Reveal>

        <Reveal className="text-center" delay={0.05}>
          <div className="toggle" style={{ marginTop: 28 }} role="tablist">
            <button
              className={tab === 'extract' ? 'active' : ''}
              onClick={() => setTab('extract')}
              role="tab"
              aria-selected={tab === 'extract'}
            >
              <IconScan size={16} /> Extract
            </button>
            <button
              className={tab === 'verify' ? 'active' : ''}
              onClick={() => setTab('verify')}
              role="tab"
              aria-selected={tab === 'verify'}
            >
              <IconScale size={16} /> Verify
            </button>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="screen">
            <div className="screen-bar">
              <span className="screen-dot" style={{ background: '#e5533c' }} />
              <span className="screen-dot" style={{ background: '#e0a83a' }} />
              <span className="screen-dot" style={{ background: '#0eb770' }} />
              <span style={{ marginLeft: 10 }}>popper · arxiv.org/abs/2401.12345</span>
            </div>
            <div className="screen-body" style={{ height: 'auto', padding: '28px 26px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {rows.map((row, i) => {
                  const meta = VERDICT_META[row.verdict];
                  const Icon = meta.Icon;
                  return (
                    <div
                      key={`${tab}-${i}`}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 14,
                        background: '#fff',
                        border: '1px solid var(--line)',
                        borderLeft: `4px solid ${meta.color}`,
                        borderRadius: 12,
                        padding: '16px 18px',
                        animation: `demoRow 0.45s ease ${i * 0.07}s both`,
                      }}
                    >
                      <span
                        style={{
                          flexShrink: 0,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 34,
                          height: 34,
                          borderRadius: 9,
                          background: 'color-mix(in srgb, ' + meta.color + ' 14%, #fff)',
                          color: meta.color,
                        }}
                      >
                        <Icon size={18} />
                      </span>
                      <div style={{ textAlign: 'left', flex: 1 }}>
                        <p style={{
                          margin: 0,
                          fontSize: 15,
                          fontWeight: 600,
                          color: 'var(--ink)',
                          fontFamily: 'var(--font-body)',
                          lineHeight: 1.4,
                        }}>
                          {row.text}
                        </p>
                        <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{row.note}</span>
                      </div>
                      <span style={{
                        flexShrink: 0,
                        fontFamily: 'var(--font-display)',
                        fontWeight: 700,
                        fontSize: 12,
                        letterSpacing: 0.4,
                        color: meta.color,
                        alignSelf: 'center',
                      }}>
                        {meta.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Reveal>
      </div>

      <style jsx>{`
        @keyframes demoRow {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}
