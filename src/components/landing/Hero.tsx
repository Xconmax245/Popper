'use client';

import { motion } from 'framer-motion';
import { IconArrowRight } from './icons';
import Image from 'next/image';

export function Hero() {
  return (
    <section id="top" className="hero" data-aos="fade-in" data-aos-duration="1000">
      <div
        className="hero-illustration left"
        style={{
          height: '100%',
          backgroundImage: 'url(/hero-bg-new.png)',
          backgroundSize: 'auto 100%',
          backgroundPosition: 'left bottom',
          backgroundRepeat: 'no-repeat',
        }}
        aria-hidden="true"
      />
      <div
        className="hero-illustration right"
        style={{
          height: '100%',
          backgroundImage: 'url(/hero-bg-new.png)',
          backgroundSize: 'auto 100%',
          backgroundPosition: 'right bottom',
          backgroundRepeat: 'no-repeat',
        }}
        aria-hidden="true"
      />

      <div className="hero-inner">
        <motion.div
          initial={{ opacity: 0, scale: 0.86, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="hero-logo flex items-center justify-center"
        >
          <Image src="/logo.png" alt="Popper" width={84} height={84} />
        </motion.div>

        <motion.h1
          className="h1"
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        >
          Making research claims <span className="accent">earn their keep</span>
        </motion.h1>

        <motion.p
          className="lead"
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
        >
          Popper is an adversarial multi-agent system. It extracts every factual claim
          from a paper, cross-examines each one against real citation sources, and keeps
          only what survives the fight.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          <a href="/demo" className="button button-round">
            Run a verification <IconArrowRight size={16} />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
