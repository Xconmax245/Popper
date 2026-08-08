import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Cinematic film-grade palette — teal & amber over near-black
        cine: {
          black: '#070809',
          'black-2': '#0A0C0E',
          panel: '#0E1316',
          'panel-2': '#11181B',
          teal: '#1DBF92',
          'teal-glow': '#2FE6C4',
          'teal-deep': '#0A2E2B',
          amber: '#F0B54A',
          'amber-glow': '#F7CE74',
          red: '#F0553F',
          'red-glow': '#FF7A66',
          cream: '#ECE6D8',
          'cream-soft': '#C7C3B7',
          muted: '#7E8C86',
          faint: '#4A554F',
        },
        // Semantic aliases (product states)
        confirmed: '#1DBF92',
        'confirmed-dark': '#0A2E2B',
        contradicted: '#F0553F',
        unverifiable: '#F0B54A',
        // Popper legacy tokens (kept for the dashboard)
        'popper-bg': '#070809',
        'popper-bg-alt': '#0A0C0E',
        'popper-ink': '#ECE6D8',
        'popper-ink-soft': '#C7C3B7',
        'popper-border': 'rgba(255,255,255,0.10)',
        // Dashboard dark mode
        'dark-bg': '#0D1117',
        'dark-surface': '#161B22',
        'dark-border': '#21262D',
        'dark-border-2': '#30363D',
        'dark-text': '#C9D1D9',
        'dark-text-soft': '#8B949E',
        'dark-text-muted': '#4A5568',
        'blue-link': '#58A6FF',
      },
      fontFamily: {
        cine: ['Cormorant Garamond', 'Georgia', 'serif'],
        display: ['Manrope', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      borderRadius: {
        card: '18px',
        block: '28px',
        pill: '100px',
        btn: '8px',
        'btn-round': '100px',
      },
      maxWidth: {
        container: '1200px',
      },
      backdropBlur: {
        glass: '18px',
        'glass-strong': '26px',
      },
      boxShadow: {
        glass: '0 24px 70px rgba(0,0,0,0.55)',
        'teal-glow': '0 0 40px rgba(29,191,146,0.35)',
      },
      animation: {
        ticker: 'ticker 32s linear infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        grain: 'grain 0.7s steps(5) infinite',
        'aperture-spin': 'aperture-spin 16s linear infinite',
      },
      keyframes: {
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'aperture-spin': {
          to: { transform: 'rotate(360deg)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
