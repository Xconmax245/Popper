'use client';

import { useEffect } from 'react';
import AOS from 'aos';
import 'aos/dist/aos.css';

export function AOSInit() {
  useEffect(() => {
    AOS.init({
      once: true,
      duration: 800,
      easing: 'ease-out-cubic',
      offset: 50,
    });
  }, []);

  return null;
}
