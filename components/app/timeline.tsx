import Link from "next/link";

import { IconAd, IconGlobe, IconMail } from "@/components/icons";
import { ago } from "@/lib/format";
import { byDay, type Channel, type TimelineEvent } from "@/lib/timeline";

import AdThumb from "./ad-thumb";
import Avatar from "./avatar";

export const CHANNEL: Record<Channel, { label: string; icon: typeof IconAd }> = {
  ad: { label: "Meta ads", icon: IconAd },
  site: { label: "Websites", icon: IconGlobe },
  email: { label: "Emails", icon: IconMail },
};

const TONE: Record<TimelineEvent["tone"], string> = {
  pos: "badge badge-pos",
  neg: "badge badge-neg",
  warn: "badge badge-warn",
  info: "badge badge-info",
  plain: "badge",
};

const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

function Row({ e, rivalName, compact }: { e: TimelineEvent; rivalName: (id: string) => string; compact: boolean }) {
  const Icon = CHANNEL[e.channel].icon;
  const inner = (
    <div className="flex gap-3 px-4 py-3 hover:bg-subtle transition-colors">
      <div className="w-10 h-10 rounded-md overflow-hidden border border-line shrink-0 grid place-items-center text-ink-3 bg-subtle">
        {e.image ? <AdThumb src={e.image} label="Ad" /> : <Icon />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          {!compact && <Avatar name={rivalName(e.rivalId)} size={16} />}
          <span className="text-[13px] font-semibold truncate">{rivalName(e.rivalId)}</span>
          <span className={TONE[e.tone]}>{e.tag}</span>
          <span className="ml-auto caption shrink-0">{ago(e.at)}</span>
        </div>
        <p className="text-[13px] mt-0.5 truncate">{e.title}</p>
        {e.detail && !compact && <p className="text-[12.5px] text-ink-3 mt-0.5 truncate">{e.detail}</p>}
      </div>
    </div>
  );
  if (!e.href) return inner;
  return e.external ? (
    <a href={e.href} target="_blank" rel="noreferrer" className="block">
      {inner}
    </a>
  ) : (
    <Link href={e.href} className="block">
      {inner}
    </Link>
  );
}

/** The cross-channel feed. `compact`: a short list without day headers, for the briefing. */
export default function Timeline({ events, rivalName, compact = false }: { events: TimelineEvent[]; rivalName: (id: string) => string; compact?: boolean }) {
  if (compact) {
    return (
      <ul className="list-none m-0 p-0 card divide-y divide-line">
        {events.map((e) => (
          <li key={e.id}>
            <Row e={e} rivalName={rivalName} compact />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {byDay(events).map(({ day, events }) => (
        <section key={day}>
          <h3 className="text-[12.5px] font-medium text-ink-3 mb-2">{dayLabel(day)}</h3>
          <ul className="list-none m-0 p-0 card divide-y divide-line">
            {events.map((e) => (
              <li key={e.id}>
                <Row e={e} rivalName={rivalName} compact={false} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
