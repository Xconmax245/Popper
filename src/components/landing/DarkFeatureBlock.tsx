'use client';

import { Reveal } from './Cinematic';
import { IconCheck, IconScale } from './icons';


const POINTS = [
  'Every claim is challenged, not assumed true.',
  'Verdicts cite the exact source that settles them.',
  'When evidence is missing, Popper refuses — on the record.',
];

export function DarkFeatureBlock() {
  return (
    <section id="method" className="section bg-cream" data-aos="fade-up" data-aos-duration="800">
      <div className="container">
        <Reveal>
          <h2 className="heading" style={{ maxWidth: 520, marginBottom: 56 }}>
            Popper is less a summarizer and more a{' '}
            <span className="accent">standing tribunal</span>
          </h2>
        </Reveal>

        <Reveal delay={0.05}>
          <div className="green-block">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 40,
                alignItems: 'center',
              }}
            >
              <div>
                <h3 className="h3">
                  We built the case<br />
                  for <span className="white">earned trust</span>
                </h3>
                <p className="white" style={{ opacity: 0.85, maxWidth: 380, margin: 0 }}>
                  Other tools tell you what a paper says. Popper tests whether it holds up.
                </p>
              </div>

              <div>
                {POINTS.map((point) => (
                  <div className="check-box" key={point}>
                    <span className="tick">
                      <IconCheck size={16} />
                    </span>
                    <span>{point}</span>
                  </div>
                ))}
                <a href="/demo" className="button button-yellow button-round" style={{ marginTop: 10 }}>
                  See the method <IconScale size={16} />
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
