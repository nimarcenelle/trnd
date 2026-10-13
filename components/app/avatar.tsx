/** A rival's initial in a muted circle, the color stable per name. */
const TONES = ["#e8e1d6", "#dde5ea", "#e3e8dc", "#ebdfe2", "#e2e0ec", "#ece5d3", "#d9e7e3"];
const INKS = ["#5c4a33", "#34505f", "#45573a", "#6a3d47", "#47406b", "#66532a", "#2f5c52"];

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export default function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const i = hash(name) % TONES.length;
  return (
    <span
      aria-hidden="true"
      className="inline-grid place-items-center rounded-full font-semibold shrink-0"
      style={{ width: size, height: size, background: TONES[i], color: INKS[i], fontSize: Math.round(size * 0.42) }}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
