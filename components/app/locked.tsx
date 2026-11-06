/** Something only the paid plan says: its title, how much is behind it, and blurred filler (the real text never reaches the page). */
export default function Locked({ title, detail, lines = 2 }: { title: string; detail: string; lines?: number }) {
  const filler = [
    "Your openings name the topic instead of giving a stranger a reason to stay past the first line.",
    "The videos that flopped all start the same way, and the creators ahead of you never do.",
    "Every hit you had did one thing in the first two seconds that the rest skipped.",
  ];
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[15px] font-semibold">{title}</div>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
          </svg>
          {detail}
        </span>
      </div>
      <div className="mt-3 grid gap-1.5 blur-[6px] select-none" aria-hidden>
        {filler.slice(0, lines).map((t) => (
          <p key={t} className="m-0 text-[14.5px] text-ink-2 leading-[1.5]">
            {t}
          </p>
        ))}
      </div>
    </div>
  );
}

