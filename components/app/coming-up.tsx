import type { Service } from "@/lib/db/types";
import { serviceForMoment, type UpcomingMoment } from "@/lib/recommend/seasonal";

/**
 * The calendar — known demand moments with the lead time to be ready.
 *
 * It needs no signal, no model and no history, which is exactly why it also
 * runs on day one while the first ranking is still being written: a brand
 * new account has no memory to show, but it can still be handed a read on
 * the next two months. Where a moment names something on their menu, it
 * says so — generic seasonal advice is a fact about the category, the same
 * line next to their own $95 facial is a fact about them.
 */
export default function ComingUp({
  moments,
  services,
  meta = "Known demand moments",
}: {
  moments: UpcomingMoment[];
  services: Service[];
  meta?: string;
}) {
  if (moments.length === 0) return null;
  return (
    <section className="panel mt-[18px]">
      <div className="panel__head">
        <span className="panel__title">Coming up</span>
        <span className="panel__meta">{meta}</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,_minmax(240px,_1fr))] gap-[18px]">
        {moments.map((m) => {
          const service = serviceForMoment(m, services);
          const startWeeks = Math.round((m.daysOut - m.leadWeeks * 7) / 7);
          return (
            <div
              key={m.label}
              className="pl-[14px]"
              style={{ borderLeft: `2px solid ${m.prepNow ? "var(--amber)" : "var(--line-strong)"}` }}
            >
              <div className="flex justify-between gap-[10px] items-baseline">
                <span className="font-disp font-semibold text-[14.5px]">{m.label}</span>
                <span
                  className="mono-label whitespace-nowrap"
                  style={m.prepNow ? { color: "var(--amber-text)" } : undefined}
                >
                  {m.daysOut <= 1 ? "now" : `${m.daysOut}d out`}
                </span>
              </div>
              <p className="text-[12.5px] leading-[1.55] text-ink-soft mx-0 mt-[6px] mb-0">
                {m.prepNow
                  ? "Start now — "
                  : `Start ~${Math.max(1, startWeeks)} wk${startWeeks === 1 ? "" : "s"} from now. `}
                {m.advice}
              </p>
              {service && (
                <p className="text-[12.5px] leading-[1.55] text-ink-faint mx-0 mt-[5px] mb-0">
                  Your {service.name}
                  {service.price_cents ? ` · $${Math.round(service.price_cents / 100)}` : ""}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
