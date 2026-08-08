'use client';

import { IconSpark } from './icons';

const PHRASES = [
  'Extract every claim',
  'Cross-examine sources',
  'Verify against citations',
  'Flag contradictions',
  'Log every refusal',
  'Cite the evidence',
  'Synthesize survivors',
  'Trace the reasoning',
];

export function TickerStrip() {
  // Duplicate the list so the marquee loops seamlessly at -50%.
  const loop = [...PHRASES, ...PHRASES];

  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track">
        {loop.map((phrase, i) => (
          <span className="ticker-item" key={i}>
            {phrase}
            <span className="ticker-star">
              <IconSpark size={16} />
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
