/** "0-2s", "18–45s" → [0, 2]; anything else → null. */
export function beatSpan(t: string): [number, number] | null {
  const m = t.match(/(\d+(?:\.\d+)?)\s*s?\s*[-–—]\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return b > a ? [a, b] : null;
}

/**
 * The script as a strip: each beat as wide as its seconds, the opening beat in pink,
 * the rest in cyan, lighter as the video goes on. A beat it can't time gets an even share.
 */
export default function ScriptTimeline({ beats }: { beats: { t: string }[] }) {
  if (beats.length < 2) return null;
  const spans = beats.map((b) => beatSpan(b.t));
  const timed = spans.filter((s): s is [number, number] => s !== null);
  const avg = timed.length ? timed.reduce((n, [a, b]) => n + (b - a), 0) / timed.length : 1;
  const widths = spans.map((s) => (s ? s[1] - s[0] : avg));
  const total = widths.reduce((a, b) => a + b, 0) || 1;
  const end = timed.length ? Math.max(...timed.map(([, b]) => b)) : null;
  return (
    <div className="grid gap-1.5" aria-hidden="true">
      <div className="flex h-2.5 gap-[3px]">
        {widths.map((w, i) => (
          <span
            key={i}
            className="rounded-full min-w-[6px]"
            style={{
              flexGrow: w / total,
              flexBasis: 0,
              background: i === 0 ? "var(--brand)" : `color-mix(in srgb, var(--cyan) ${Math.round(85 - (i / Math.max(1, beats.length - 1)) * 45)}%, var(--line))`,
            }}
          />
        ))}
      </div>
      <div className="flex justify-between mono text-[11px] text-ink-3">
        <span>0s</span>
        {end !== null && <span>{end}s</span>}
      </div>
    </div>
  );
}
