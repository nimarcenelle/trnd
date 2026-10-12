/**
 * Stand-in ad creatives for the marketing pages, drawn as SVG so the landing
 * page never shows a real brand's ad. Three shapes cover what a feed looks
 * like: a product shot, a talking-head UGC frame with captions, and an offer.
 */

export type CreativeKind = "product" | "ugc" | "offer";

export interface CreativeSpec {
  kind: CreativeKind;
  from: string;
  to: string;
  line: string;
  sub?: string;
}

export default function SampleCreative({ spec, id }: { spec: CreativeSpec; id: string }) {
  const g = `g-${id}`;
  return (
    <svg viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor={spec.from} />
          <stop offset="1" stopColor={spec.to} />
        </linearGradient>
        <radialGradient id={`${g}-l`} cx="0.7" cy="0.2" r="0.7">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="500" fill={`url(#${g})`} />
      <rect width="400" height="500" fill={`url(#${g}-l)`} />

      {spec.kind === "product" && (
        <g>
          <ellipse cx="200" cy="420" rx="110" ry="16" fill="#000" opacity="0.22" />
          <rect x="150" y="215" width="100" height="205" rx="22" fill="#f7f3ec" />
          <rect x="172" y="196" width="56" height="28" rx="10" fill="#e9e2d6" />
          <rect x="166" y="285" width="68" height="70" rx="6" fill={spec.to} opacity="0.35" />
          <rect x="176" y="301" width="48" height="6" rx="3" fill="#fff" opacity="0.8" />
          <rect x="176" y="315" width="34" height="5" rx="2.5" fill="#fff" opacity="0.6" />
        </g>
      )}

      {spec.kind === "ugc" && (
        <g>
          <circle cx="200" cy="215" r="70" fill="#f1d9c4" />
          <path d="M120 215c0-70 40-105 80-105s80 35 80 105c-10-40-40-62-80-62s-70 22-80 62z" fill="#3a2a20" />
          <path d="M70 500c10-110 60-170 130-170s120 60 130 170z" fill="#efe7dc" />
          <rect x="60" y="400" width="280" height="44" rx="8" fill="#000" opacity="0.55" />
          <text x="200" y="428" textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif" fontWeight="700" fontSize="19" fill="#fff">
            {spec.sub ?? ""}
          </text>
        </g>
      )}

      {spec.kind === "offer" && (
        <g>
          <circle cx="300" cy="360" r="120" fill="#fff" opacity="0.12" />
          <text x="40" y="300" fontFamily="Helvetica, Arial, sans-serif" fontWeight="800" fontSize="96" fill="#fff" letterSpacing="-4">
            {spec.sub ?? ""}
          </text>
          <rect x="40" y="340" width="150" height="40" rx="20" fill="#fff" />
          <text x="115" y="366" textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif" fontWeight="700" fontSize="15" fill="#111">
            SHOP NOW
          </text>
        </g>
      )}

      {spec.kind !== "ugc" && (
        <text x="32" y="150" fontFamily="Helvetica, Arial, sans-serif" fontWeight="800" fontSize="30" fill="#fff" letterSpacing="-0.5">
          {spec.line}
        </text>
      )}
      {spec.kind === "product" && spec.sub && (
        <text x="32" y="180" fontFamily="Helvetica, Arial, sans-serif" fontSize="18" fill="#fff" opacity="0.85">
          {spec.sub}
        </text>
      )}
    </svg>
  );
}
