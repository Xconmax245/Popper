'use client';

import { Reveal, RevealStagger, RevealItem } from './Cinematic';
import {
  IconScan,
  IconScale,
  IconChain,
  IconGraph,
  IconCoins,
  IconTrace,
  IconArrowRight,
} from './icons';

const FEATURES = [
  {
    Icon: IconScan,
    title: 'Claim Extraction',
    body: 'Every factual, checkable statement is pulled from the paper and isolated for review.',
    alt: false,
  },
  {
    Icon: IconScale,
    title: 'Adversarial Verification',
    body: 'A prosecutor and a defender argue each claim against real citation sources.',
    alt: true,
  },
  {
    Icon: IconChain,
    title: 'Provenance Chain',
    body: 'Every verdict links back to the exact source passage that settled it.',
    alt: false,
  },
  {
    Icon: IconGraph,
    title: 'Claim Graph',
    body: 'See how claims depend on one another and where a single failure cascades.',
    alt: true,
  },
  {
    Icon: IconCoins,
    title: 'Cost Ledger',
    body: 'Token spend and model calls are itemised per run — no hidden meter.',
    alt: false,
  },
  {
    Icon: IconTrace,
    title: 'Execution Trace',
    body: 'A full, replayable log of every agent step, including every logged refusal.',
    alt: true,
  },
];

export function FeatureGrid() {
  return (
    <section className="section bg-grey" data-aos="fade-up" data-aos-duration="800">
      <div className="container text-center">
        <Reveal>
          <span className="eyebrow">What you get</span>
          <h2 className="heading">
            Popper is <span className="accent">different</span>
          </h2>
          <p className="lead mx-auto" style={{ maxWidth: 640, marginTop: 8 }}>
            Summarizers optimise for fluency. Popper optimises for whether a claim can be
            defended — and shows its work at every step.
          </p>
        </Reveal>

        <RevealStagger className="feature-grid">
          {FEATURES.map(({ Icon, title, body, alt }) => (
            <RevealItem key={title}>
              <article className={`feature-card${alt ? ' alt' : ''}`}>
                <span className="feature-icon">
                  <Icon size={30} />
                </span>
                <h4>{title}</h4>
                <p>{body}</p>
              </article>
            </RevealItem>
          ))}
        </RevealStagger>

        <Reveal delay={0.05}>
          <a href="/demo" className="button button-round" style={{ marginTop: 56 }}>
            Run a verification <IconArrowRight size={16} />
          </a>
        </Reveal>
      </div>
    </section>
  );
}
