/**
 * Stand-in ad creatives for the marketing pages, drawn as SVG in the formats
 * DTC brands actually run on Meta: a typographic statement, a review card, a
 * product shot and an offer. Every brand on them is invented.
 */

export type CreativeSpec =
  | { kind: "statement"; bg: string; fg: string; text: string; brand: string }
  | { kind: "review"; bg: string; fg: string; quote: string; who: string; brand: string }
  | { kind: "product"; bg: string; bottle: string; label: string; text?: string }
  | { kind: "offer"; bg: string; fg: string; big: string; small: string; brand: string };

const FONT = "Inter Variable, Inter, Helvetica, Arial, sans-serif";

/** Splits text into lines of at most `max` characters, on word breaks. */
function lines(text: string, max: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(" ")) {
    if ((cur + " " + w).trim().length > max) {
      out.push(cur.trim());
      cur = w;
    } else cur += " " + w;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function Bottle({ x, y, color, label, id }: { x: number; y: number; color: string; label: string; id: string }) {
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-b`} x1="0" x2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.22" />
          <stop offset="0.25" stopColor="#fff" stopOpacity="0.18" />
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.28" />
        </linearGradient>
        <radialGradient id={`${id}-s`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000" stopOpacity="0.28" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx={x + 60} cy={y + 262} rx="96" ry="14" fill={`url(#${id}-s)`} />
      <rect x={x + 34} y={y} width="52" height="34" rx="6" fill="#2a2a28" />
      <rect x={x} y={y + 30} width="120" height="232" rx="18" fill={color} />
      <rect x={x} y={y + 30} width="120" height="232" rx="18" fill={`url(#${id}-b)`} />
      <rect x={x + 14} y={y + 110} width="92" height="84" rx="4" fill="#fff" opacity="0.92" />
      <text x={x + 60} y={y + 146} textAnchor="middle" fontFamily={FONT} fontWeight="700" fontSize="15" letterSpacing="2" fill="#1c1c1a">
        {label.toUpperCase()}
      </text>
      <rect x={x + 34} y={y + 160} width="52" height="3" rx="1.5" fill="#1c1c1a" opacity="0.3" />
      <rect x={x + 42} y={y + 170} width="36" height="3" rx="1.5" fill="#1c1c1a" opacity="0.2" />
    </g>
  );
}

export default function SampleCreative({ spec, id }: { spec: CreativeSpec; id: string }) {
  return (
    <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" className="block w-full h-full" aria-hidden="true">
      <rect width="400" height="400" fill={spec.bg} />

      {spec.kind === "statement" && (
        <g fontFamily={FONT} fill={spec.fg}>
          {lines(spec.text, 15).map((l, i) => (
            <text key={i} x="36" y={92 + i * 50} fontWeight="700" fontSize="44" letterSpacing="-1.6">
              {l}
            </text>
          ))}
          <text x="36" y="364" fontWeight="600" fontSize="15" letterSpacing="3" opacity="0.75">
            {spec.brand.toUpperCase()}
          </text>
        </g>
      )}

      {spec.kind === "review" && (
        <g fontFamily={FONT}>
          <rect x="32" y="60" width="336" height="250" rx="16" fill="#fff" />
          <text x="60" y="108" fontSize="24" fill="#f5a524" letterSpacing="3">
            ★★★★★
          </text>
          {lines(spec.quote, 24).map((l, i) => (
            <text key={i} x="60" y={150 + i * 32} fontWeight="600" fontSize="23" letterSpacing="-0.4" fill="#1c1c1a">
              {i === 0 ? "“" : ""}
              {l}
            </text>
          ))}
          <text x="60" y="286" fontSize="15" fill="#6b6b66">
            {spec.who} · Verified buyer
          </text>
          <text x="32" y="364" fontWeight="600" fontSize="15" letterSpacing="3" fill={spec.fg} opacity="0.8">
            {spec.brand.toUpperCase()}
          </text>
        </g>
      )}

      {spec.kind === "product" && (
        <g>
          <Bottle x={140} y={78} color={spec.bottle} label={spec.label} id={id} />
          {spec.text && (
            <text x="30" y="56" fontFamily={FONT} fontWeight="600" fontSize="22" letterSpacing="-0.4" fill="#1c1c1a">
              {spec.text}
            </text>
          )}
        </g>
      )}

      {spec.kind === "offer" && (
        <g fontFamily={FONT} fill={spec.fg}>
          <text x="36" y="70" fontWeight="600" fontSize="15" letterSpacing="3" opacity="0.8">
            {spec.brand.toUpperCase()}
          </text>
          <text x="32" y="210" fontWeight="800" fontSize="104" letterSpacing="-5">
            {spec.big}
          </text>
          {lines(spec.small, 24).map((l, i) => (
            <text key={i} x="36" y={258 + i * 30} fontWeight="500" fontSize="23" opacity="0.9">
              {l}
            </text>
          ))}
          <rect x="36" y="318" width="132" height="40" rx="20" fill={spec.fg} />
          <text x="102" y="344" textAnchor="middle" fontWeight="600" fontSize="15" fill={spec.bg}>
            Shop now
          </text>
        </g>
      )}
    </svg>
  );
}
