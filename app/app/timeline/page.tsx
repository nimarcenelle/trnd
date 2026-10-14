import Link from "next/link";
import { redirect } from "next/navigation";

import Timeline, { CHANNEL } from "@/components/app/timeline";
import { getSessionUser } from "@/lib/auth/session";
import { getBrand, listChanges, listEmails, listRivals, listSiteChanges } from "@/lib/data";
import { buildTimeline, type Channel } from "@/lib/timeline";

export const metadata = { title: "Timeline — TRND" };

/** Everything competitors did, across ads, websites and emails, day by day. */
export default async function TimelinePage({ searchParams }: PageProps<"/app/timeline">) {
  const { channel, rival } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const brand = await getBrand(user.id);
  if (!brand) redirect("/app/setup");

  const [rivals, adChanges, site, emails] = await Promise.all([listRivals(brand.id), listChanges(brand.id, 30), listSiteChanges(brand.id), listEmails(brand.id, { days: 30 })]);
  const names = new Map(rivals.map((r) => [r.id, r.name]));
  const all = buildTimeline({ adChanges, site, emails, emailHref: (e) => `/app/rivals/${e.rival_id}?view=emails#${e.id}` }).filter((e) => names.has(e.rivalId));
  const ch = typeof channel === "string" && channel in CHANNEL ? (channel as Channel) : null;
  const rv = typeof rival === "string" && names.has(rival) ? rival : null;
  const events = all.filter((e) => (!ch || e.channel === ch) && (!rv || e.rivalId === rv));
  const count = (c: Channel) => all.filter((e) => e.channel === c && (!rv || e.rivalId === rv)).length;
  const href = (c: Channel | null, r: string | null) => {
    const p = new URLSearchParams();
    if (c) p.set("channel", c);
    if (r) p.set("rival", r);
    return `/app/timeline${p.size ? `?${p}` : ""}`;
  };
  const pill = (active: boolean) =>
    `h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium shrink-0 ${active ? "bg-bg text-ink shadow-[0_0_0_1px_var(--line),var(--shadow-sm)]" : "text-ink-2 hover:text-ink"}`;

  return (
    <div>
      <header>
        <h1 className="heading text-[22px]">Timeline</h1>
        <p className="text-[13px] text-ink-3 mt-0.5">Every competitor move across Meta ads, websites and emails, last 30 days.</p>
      </header>

      <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="inline-flex gap-1 p-1 rounded-lg bg-muted overflow-x-auto max-w-full">
          <Link href={href(null, rv)} className={pill(!ch)}>
            All <span className="text-ink-3 tnum">{all.filter((e) => !rv || e.rivalId === rv).length}</span>
          </Link>
          {(Object.keys(CHANNEL) as Channel[]).map((c) => {
            const Icon = CHANNEL[c].icon;
            return (
              <Link key={c} href={href(c, rv)} className={pill(ch === c)}>
                <Icon /> {CHANNEL[c].label} <span className="text-ink-3 tnum">{count(c)}</span>
              </Link>
            );
          })}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Link href={href(ch, null)} className={`badge ${!rv ? "badge-outline !text-ink" : ""}`}>
            All rivals
          </Link>
          {rivals.map((r) => (
            <Link key={r.id} href={href(ch, r.id)} className={`badge ${rv === r.id ? "badge-outline !text-ink" : ""}`}>
              {r.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {events.length ? (
          <Timeline events={events} rivalName={(id) => names.get(id) ?? "?"} />
        ) : (
          <div className="card p-6 text-[13.5px] text-ink-2">
            Nothing here yet. New and stopped ads, website changes and competitor emails show up as the daily scans find them.
          </div>
        )}
      </div>
    </div>
  );
}
