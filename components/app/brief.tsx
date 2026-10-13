/**
 * A creative brief as the model writes it: "Hook: ...", "Format: ..." lines.
 * Labeled lines become a definition list; anything else stays as text.
 */
export default function Brief({ text }: { text: string }) {
  const rows = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^([A-Za-z][A-Za-z /&()+-]{1,24}):\s*(.+)$/);
      return m ? { label: m[1], value: m[2] } : { label: null, value: l };
    });
  return (
    <dl className="m-0 grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px] leading-[1.5]">
      {rows.map((r, i) =>
        r.label ? (
          <div key={i} className="contents">
            <dt className="text-ink-3">{r.label}</dt>
            <dd className={`m-0 ${/hook/i.test(r.label) ? "font-medium text-ink" : "text-ink-2"}`}>{r.value}</dd>
          </div>
        ) : (
          <dd key={i} className="m-0 col-span-2 text-ink-2">
            {r.value}
          </dd>
        ),
      )}
    </dl>
  );
}
