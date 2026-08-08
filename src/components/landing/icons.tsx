import type { SVGProps } from 'react';

/**
 * Cinematic line-icon set — replaces all emoji across the landing page.
 * Feather-style: 24x24, currentColor stroke, 1.6 weight.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 24, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/* Lens / aperture — the Popper mark */
export const IconAperture = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M12 2.5 8.5 8.5M21 8 14.5 8M18.5 20 15 14M6 21.5 9.5 15.5M3 16 9.5 16M5.5 4 9 10" />
  </Base>
);

/* Adversarial verification — balance scale */
export const IconScale = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3v18M7 21h10" />
    <path d="M12 6 4 8l3 6a3 3 0 0 1-6 0l3-6M12 6l8 2-3 6a3 3 0 0 0 6 0l-3-6" />
  </Base>
);

/* Shared claim graph — network nodes */
export const IconGraph = (p: IconProps) => (
  <Base {...p}>
    <circle cx="5" cy="6" r="2.2" />
    <circle cx="19" cy="7" r="2.2" />
    <circle cx="12" cy="18" r="2.2" />
    <path d="M6.8 7.3 10.4 16M17.4 8.6 13.4 16.4M7 6.4 16.8 6.7" />
  </Base>
);

/* Provenance chain — links */
export const IconChain = (p: IconProps) => (
  <Base {...p}>
    <path d="M9.5 14.5 14.5 9.5" />
    <path d="M8 12 6 14a3.5 3.5 0 0 0 5 5l2-2M16 12l2-2a3.5 3.5 0 0 0-5-5l-2 2" />
  </Base>
);

/* Cost ledger — coins */
export const IconCoins = (p: IconProps) => (
  <Base {...p}>
    <ellipse cx="9" cy="7" rx="5.5" ry="2.6" />
    <path d="M3.5 7v4c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6V7" />
    <path d="M9 13.5v3.9c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6v-6" />
    <ellipse cx="14.5" cy="11" rx="5.5" ry="2.6" />
  </Base>
);

/* Execution trace — ordered log */
export const IconTrace = (p: IconProps) => (
  <Base {...p}>
    <path d="M8 4h11M8 9h11M8 15h11M8 20h11" />
    <circle cx="4" cy="4" r="1.2" />
    <circle cx="4" cy="9" r="1.2" />
    <circle cx="4" cy="15" r="1.2" />
    <circle cx="4" cy="20" r="1.2" />
  </Base>
);

/* Trust density — gauge */
export const IconGauge = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 15a8.5 8.5 0 0 1 17 0" />
    <path d="M12 15l4-4" />
    <circle cx="12" cy="15" r="1.3" />
    <path d="M3.5 15h1.6M18.9 15h1.6M12 5.8v1.6" />
  </Base>
);

/* Check */
export const IconCheck = (p: IconProps) => (
  <Base {...p}>
    <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
  </Base>
);

/* Arrow right */
export const IconArrowRight = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </Base>
);

/* Arrow left */
export const IconArrowLeft = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 12H5M11 6l-6 6 6 6" />
  </Base>
);


/* Arrow down */
export const IconArrowDown = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 4v15M6 13l6 6 6-6" />
  </Base>
);

/* Plus */
export const IconPlus = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

/* Play (filled triangle) */
export const IconPlay = ({ size = 24, ...props }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
       fill="currentColor" aria-hidden="true" {...props}>
    <path d="M7 4.5v15a1 1 0 0 0 1.5.87l12-7.5a1 1 0 0 0 0-1.74l-12-7.5A1 1 0 0 0 7 4.5Z" />
  </svg>
);

/* Film / reel */
export const IconFilm = (p: IconProps) => (
  <Base {...p}>
    <rect x="2.5" y="4" width="19" height="16" rx="2" />
    <path d="M7 4v16M17 4v16M2.5 9h4.5M2.5 15h4.5M17 9h4.5M17 15h4.5M7 12h10" />
  </Base>
);

/* Warning triangle */
export const IconWarning = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.5 22 20H2L12 3.5Z" />
    <path d="M12 10v4.5M12 17.5h.01" />
  </Base>
);

/* Clock / loading */
export const IconClock = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </Base>
);

/* GitHub */
export const IconGithub = ({ size = 24, ...props }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
       fill="currentColor" aria-hidden="true" {...props}>
    <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49
      0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.62.07-.62
      1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.55-1.14-4.55-5.07
      0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 5 0c1.91-1.33
      2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57
      5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.05 10.05 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
  </svg>
);

/* Doc / readme */
export const IconDoc = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 2.5h8L19 7v13a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4a1.5 1.5 0 0 1 1-1.5Z" />
    <path d="M13.5 2.5V7H19M8.5 12.5h7M8.5 16h7" />
  </Base>
);

/* Spark / star accent for the ticker */
export const IconSpark = ({ size = 18, ...props }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
       fill="currentColor" aria-hidden="true" {...props}>
    <path d="M12 1.5 13.9 9.4 22 11l-8.1 1.6L12 22.5 10.1 12.6 2 11l8.1-1.6L12 1.5Z" />
  </svg>
);

/* Clapperboard — hero + how-it-works motif */
export const IconClapper = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 9h18v10.5A1.5 1.5 0 0 1 19.5 21h-15A1.5 1.5 0 0 1 3 19.5V9Z" />
    <path d="M3 9 4.4 4.2l17.2 1.4L21 9M8.3 4.6 6.6 8.6M13.6 5 11.9 9M18.8 5.4 17.1 9" />
  </Base>
);

/* Extract / scan document */
export const IconScan = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
    <path d="M7.5 12h9" />
  </Base>
);

/* Shield check — audit */
export const IconShield = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3 5 6v5c0 4.2 2.9 7.4 7 9 4.1-1.6 7-4.8 7-9V6l-7-3Z" />
    <path d="M9 11.5 11.2 14 15.5 9.5" />
  </Base>
);

/* Download / ingest */
export const IconDownload = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4.5 20.5h15" />
  </Base>
);

/* Flask / synthesis */
export const IconFlask = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 3h6M10 3v6.2L4.8 18a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9.2V3" />
    <path d="M7.5 14.5h9" />
  </Base>
);

/* Clipboard / audit report */
export const IconClipboard = (p: IconProps) => (
  <Base {...p}>
    <rect x="6" y="4" width="12" height="17" rx="2" />
    <path d="M9 4a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4v1H9V4Z" />
    <path d="M9 11h6M9 15h4" />
  </Base>
);

/* Close / dismiss */
export const IconX = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);


