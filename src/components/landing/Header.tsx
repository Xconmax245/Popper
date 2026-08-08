'use client';

import { IconGithub } from './icons';
import Image from 'next/image';

export function Header() {
  return (
    <header className="header" data-aos="fade-down" data-aos-duration="1000">
      <div className="header-inner">
        <div className="nav-left">
          <a className="nav-link" href="#how">
            How it works<span className="beta-tag">Live</span>
          </a>
          <a className="nav-link nav-hide-mobile" href="#method">Method</a>
        </div>

        <a href="#top" className="brand brand-center" aria-label="Popper home">
          <span className="brand-mark">
            <Image src="/logo.png" alt="Popper" width={30} height={30} />
          </span>
          Popper
        </a>

        <div className="nav-right">
          <a
            className="nav-link nav-hide-mobile"
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconGithub size={17} /> GitHub
          </a>
          <a href="/demo" className="button button-outline button-round">Launch app</a>
        </div>
      </div>
    </header>
  );
}
