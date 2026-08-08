'use client';

import { Reveal } from './Cinematic';
import { IconArrowRight } from './icons';

interface StatsCalloutProps {
  stats: { num: string; label: string }[];
}

export function StatsCallout({ stats }: StatsCalloutProps) {
  return (
    <section className="section bg-cream" data-aos="fade-up" data-aos-duration="800">
      <div className="container">
        <Reveal>
          <div className="callout">
            <span className="eyebrow" style={{ color: 'var(--yellow)' }}>The bar we hold</span>
            <h2 className="heading">
              No claim survives <span className="accent">without a fight</span>
            </h2>
            <p className="lead mx-auto white" style={{ maxWidth: 620, opacity: 0.82 }}>
              Popper would rather refuse than guess. If the evidence isn&apos;t there, the
              claim doesn&apos;t make it into the synthesis — and the refusal is logged.
            </p>

            <div className="stat-row">
              {stats.map((s) => (
                <div key={s.label}>
                  <div className="stat-num text-yellow">{s.num}</div>
                  <div className="stat-label">{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 44 }}>
              <a href="/demo" className="button button-white button-round">
                Put a paper on trial <IconArrowRight size={16} />
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
