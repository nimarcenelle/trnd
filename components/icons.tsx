/** A small set of 16px stroke icons, drawn to one grid. */
type P = { className?: string };
const base = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const IconBriefing = (p: P) => (
  <svg {...base} {...p} aria-hidden="true">
    <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
    <path d="M5 6h6M5 8.5h6M5 11h3.5" />
  </svg>
);
export const IconRivals = (p: P) => (
  <svg {...base} {...p} aria-hidden="true">
    <circle cx="6" cy="6" r="2.5" />
    <path d="M1.75 13.5c.5-2.3 2.2-3.5 4.25-3.5s3.75 1.2 4.25 3.5" />
    <circle cx="11.5" cy="5.5" r="2" />
    <path d="M11 9.6c1.7.1 2.9 1.2 3.25 3.4" />
  </svg>
);
export const IconSettings = (p: P) => (
  <svg {...base} {...p} aria-hidden="true">
    <circle cx="8" cy="8" r="2" />
    <path d="M8 1.75v1.5M8 12.75v1.5M14.25 8h-1.5M3.25 8h-1.5M12.4 3.6l-1.06 1.06M4.66 11.34 3.6 12.4M12.4 12.4l-1.06-1.06M4.66 4.66 3.6 3.6" />
  </svg>
);
export const IconArrowUpRight = (p: P) => (
  <svg {...base} {...p} aria-hidden="true">
    <path d="M5 11 11 5M6 5h5v5" />
  </svg>
);
export const IconRefresh = (p: P) => (
  <svg {...base} {...p} aria-hidden="true">
    <path d="M13.25 8A5.25 5.25 0 1 1 11.7 4.3M13.25 2.5v3h-3" />
  </svg>
);
export const IconPlus = (p: P) => (
  <svg {...base} {...p} aria-hidden="true">
    <path d="M8 3v10M3 8h10" />
  </svg>
);
export const IconCheck = (p: P) => (
  <svg {...base} {...p} aria-hidden="true">
    <path d="m3.5 8.5 3 3 6-7" />
  </svg>
);
export const IconArrowRight = (p: P) => (
  <svg {...base} {...p} aria-hidden="true">
    <path d="M3 8h10M9 4l4 4-4 4" />
  </svg>
);
export const IconBrand = (p: P) => (
  <svg {...base} {...p} aria-hidden="true">
    <path d="M8 1.75 9.6 5.1l3.65.45-2.7 2.5.72 3.6L8 9.85l-3.27 1.8.72-3.6-2.7-2.5L6.4 5.1Z" />
  </svg>
);
