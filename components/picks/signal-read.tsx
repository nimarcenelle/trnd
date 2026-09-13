"use client";

import Link from "next/link";
import { useId, useState } from "react";

import type { SignalReadView } from "@/lib/picks/detail";

/**
 * The four signals as one read: a tile per signal with its score and a thin
 * bar, and one explanation at a time for the signal the owner taps. A
 * low-confidence signal shows no number, only what is missing and where to
 * fix it. The first scored signal is open by default, so the card never
 * starts empty.
 */
export default function SignalRead({ read }: { read: SignalReadView }) {
  const first = read.signals.find((s) => s.score !== null) ?? read.signals[0];
  const [open, setOpen] = useState(first?.name ?? null);
  const panelId = useId();
  const current = read.signals.find((s) => s.name === open) ?? null;

  return (
    <section className="pickd__card sigread" aria-labelledby="pickd-sigread">
      <header className="sigread__head">
        <h2 id="pickd-sigread" className="pickd__h2">
          Signal read
        </h2>
        <span className="sigread__hint">Tap a signal for why</span>
      </header>
      <div className="sigread__tiles" role="tablist" aria-label="Signals">
        {read.signals.map((s) => {
          const selected = s.name === open;
          return (
            <button
              key={s.name}
              type="button"
              role="tab"
              id={`${panelId}-${s.name}`}
              aria-selected={selected}
              aria-controls={`${panelId}-panel`}
              className={`sigread__tile is-${s.name}${selected ? " is-selected" : ""}${s.score === null ? " is-gap" : ""}`}
              onClick={() => setOpen(s.name)}
            >
              <span className="sigread__label">{s.label}</span>
              <span className="sigread__score">{s.score === null ? <span aria-label="No reading">–</span> : s.score}</span>
              <span className="sigread__track" aria-hidden="true">
                <span className="sigread__fill" style={{ width: `${s.score ?? 0}%` }} />
              </span>
              <span className="sr-only">
                {s.score === null ? `, ${s.note ?? "not read yet"}` : `, ${s.score} of 100, ${s.confidence} confidence`}
              </span>
            </button>
          );
        })}
      </div>
      {current && (
        <div id={`${panelId}-panel`} role="tabpanel" aria-labelledby={`${panelId}-${current.name}`} className="sigread__why">
          {current.score === null ? (
            <p className="sigread__line is-gap">
              <b>{current.label}</b> · {current.note ?? "Not read yet"}
              {current.cta && (
                <>
                  {" "}
                  <Link href={current.cta.href} className="sigread__cta">
                    {current.cta.label}
                  </Link>
                </>
              )}
            </p>
          ) : (
            <>
              <p className="sigread__line">
                <b>
                  {current.label} {current.score}
                </b>
                <span className="sigread__conf"> · {current.confidence} confidence</span>
              </p>
              <p className="sigread__about">{current.about}</p>
              <ul className="sigread__components">
                {current.components.map((c) => (
                  <li key={c.key}>
                    <span className="sigread__comp-label">{c.label}</span>
                    <span className={`sigread__comp-score${c.score === null ? " is-gap" : ""}`}>{c.score === null ? "–" : c.score}</span>
                    {c.detail && <span className="sigread__comp-detail">{c.detail}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
