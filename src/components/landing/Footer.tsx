'use client';

import { IconGithub, IconDoc, IconScan } from './icons';
import Image from 'next/image';

export function Footer() {
  return (
    <footer className="footer" data-aos="fade-in" data-aos-duration="1000">
      <div className="container">
        <div className="footer-top">
          <div style={{ maxWidth: 340 }}>
            <div className="footer-brand">
              <span className="brand-mark">
                <Image src="/logo.png" alt="Popper" width={30} height={30} />
              </span>
              Popper
            </div>
            <p className="footer-desc">
              Adversarial claim verification for research papers. Every verdict cites its
              evidence. Every refusal is logged. No claim survives without a fight.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 64, flexWrap: 'wrap' }}>
            <div>
              <div className="footer-col-title">Product</div>
              <a className="footer-link" href="#how">How it works</a>
              <a className="footer-link" href="#method">Method</a>
              <a className="footer-link" href="/demo">Launch app</a>
            </div>
            <div>
              <div className="footer-col-title">Resources</div>
              <a className="footer-link" href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
              <a className="footer-link" href="https://arxiv.org" target="_blank" rel="noopener noreferrer">arXiv</a>
              <a className="footer-link" href="https://www.crossref.org" target="_blank" rel="noopener noreferrer">Crossref</a>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <span className="footer-copy">© {new Date().getFullYear()} Popper · Built for the IIT Madras Research Agents Hack</span>

          <div className="footer-legend">
            <span className="legend"><span className="legend-dot" style={{ background: 'var(--confirmed)' }} /> Confirmed</span>
            <span className="legend"><span className="legend-dot" style={{ background: 'var(--contradicted)' }} /> Contradicted</span>
            <span className="legend"><span className="legend-dot" style={{ background: 'var(--unverifiable)' }} /> Unverifiable</span>
          </div>

          <div style={{ display: 'flex', gap: 18 }}>
            <a className="footer-link" style={{ margin: 0 }} href="https://github.com" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
              <IconGithub size={20} />
            </a>
            <a className="footer-link" style={{ margin: 0 }} href="#" aria-label="Docs">
              <IconDoc size={20} />
            </a>
            <a className="footer-link" style={{ margin: 0 }} href="/demo" aria-label="Run">
              <IconScan size={20} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
