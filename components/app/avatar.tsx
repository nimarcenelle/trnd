/** A creator's initial in a colored circle, the color stable per handle. Initials, not photos: TikTok's image links expire. */
const TONES = ["#fde6ee", "#def3f6", "#e2f4e9", "#fbefdb", "#ece6fb", "#f6e3f3"];
const INKS = ["#b01a4a", "#0a6f7f", "#14683d", "#8a5205", "#5b3fb8", "#8f2f84"];

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** The letter and colors for a handle; the shareable card draws the same circle. */
export function avatarTone(name: string): { letter: string; background: string; color: string } {
  const i = hash(name) % TONES.length;
  const letter = name.replace(/[^\p{L}\p{N}]/gu, "").charAt(0).toUpperCase() || "?";
  return { letter, background: TONES[i], color: INKS[i] };
}

export default function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const { letter, background, color } = avatarTone(name);
  return (
    <span
      aria-hidden="true"
      className="inline-grid place-items-center rounded-full font-bold shrink-0"
      style={{ width: size, height: size, background, color, fontSize: Math.round(size * 0.42) }}
    >
      {letter}
    </span>
  );
}
