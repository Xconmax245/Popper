'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Reveal } from './Cinematic';
import { IconPlus, IconArrowRight } from './icons';
import Image from 'next/image';

const FAQS = [
  {
    q: 'What exactly does Popper verify?',
    a: 'Popper isolates every factual, checkable claim in a paper — accuracy numbers, comparative statements, causal assertions — and tests each one against real citation sources rather than accepting the paper at its word.',
  },
  {
    q: 'How is this different from a summarizer?',
    a: 'A summarizer restates what a paper says. Popper interrogates whether each statement holds up: a prosecutor argues against the claim, a defender argues for it, and the verdict is decided by the evidence found in cited sources.',
  },
  {
    q: 'What happens when there is no evidence?',
    a: 'Popper refuses to confirm. Instead of guessing, it marks the claim unverifiable and logs the refusal in the execution trace, so nothing unsupported slips into the final synthesis.',
  },
  {
    q: 'Where do the sources come from?',
    a: 'Popper resolves citations through Crossref and Semantic Scholar, then reads the referenced material to find passages that either support or contradict the claim under review.',
  },
  {
    q: 'Can I see how a verdict was reached?',
    a: 'Yes. Every run produces a full provenance chain and a replayable execution trace — each verdict links to the exact source passage that settled it, plus the token and cost ledger for the run.',
  },
  {
    q: 'What papers can I run it on?',
    a: 'Paste any arXiv paper URL to start a verification. Popper ingests the paper, extracts its claims, and streams results to the dashboard live as each agent finishes.',
  },
];

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="faq-item" onClick={() => setOpen((v) => !v)}>
      <div className="faq-q" role="button" aria-expanded={open}>
        <span>{q}</span>
        <motion.span
          className="faq-plus"
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <IconPlus size={22} />
        </motion.span>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="faq-a"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="faq-a-inner">{a}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FaqAccordion() {
  return (
    <section className="section bg-cream" data-aos="fade-up" data-aos-duration="800">
      <div className="container-sm">
        <Reveal className="text-center" >
          <h2 className="heading" style={{ marginBottom: 40 }}>FAQs</h2>
        </Reveal>

        <Reveal delay={0.05}>
          <div>
            {FAQS.map((item) => (
              <FaqRow key={item.q} {...item} />
            ))}
          </div>
        </Reveal>
        <div className="faq-cta" style={{ textAlign: 'center', marginTop: 64, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Image src="/logo.png" alt="Popper" width={64} height={64} style={{ marginBottom: 24 }} />
          <h3 className="h3">Still have questions?</h3>
          <p className="lead" style={{ margin: '16px auto 32px' }}>
            Try it yourself. The code is open source, and the methodology is public.
          </p>
          <a href="/demo" className="button button-primary button-round">
            Run a verification <IconArrowRight size={16} />
          </a>
        </div>
      </div>
    </section>
  );
}
