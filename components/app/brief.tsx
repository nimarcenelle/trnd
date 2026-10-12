/**
 * A creative brief as the model writes it: "Hook: ...", "Format: ..." lines.
 * Labeled lines become a definition list; anything else stays as text.
 */
export default function Brief({ text }: { text: string }) {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const rows = lines.map((l) => {
    const m = l.match(/^([A-Za-z][A-Za-z /&()+-]{1,24}):\s*(.+)$/);
    return m ? { label: m[1], value: m[2] } : { label: null, value: l };
  });
  return (
    <dl className="m-0 grid grid-cols-[72px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[13.5px] leading-[1.5]">
      {rows.map((r, i) =>
        r.label ? (
          <div key={i} className="contents">
            <dt className="label !text-[10px] pt-[3px]">{r.label}</dt>
            <dd className={`m-0 ${/hook/i.test(r.label) ? "font-semibold text-ink" : "text-ink-2"}`}>{r.value}</dd>
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
