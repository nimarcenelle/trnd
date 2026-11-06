import Link from "next/link";

import SiteNav from "@/components/site-nav";
import { unsubscribe } from "@/lib/creator/store";

export const metadata = { title: "Unsubscribe — TRND" };

/** The link at the foot of the weekly re-check. No login: the token is the key. */
export default async function UnsubscribePage({ searchParams }: PageProps<"/creators/unsubscribe">) {
  const { t } = await searchParams;
  const done = typeof t === "string" && (await unsubscribe(t).catch(() => false));
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav links={false} />
      <div className="wrap py-24 max-w-[520px]">
        <h1 className="heading text-[22px]">{done ? "You're unsubscribed" : "That link didn't work"}</h1>
        <p className="text-[15px] text-ink-2 mt-3 leading-[1.6]">
          {done
            ? "You won't get the weekly re-check again. You can run the check by hand any time."
            : "It may already have been used. Write to hello@usetrnd.com and we'll take you off the list."}
        </p>
        <Link href="/creators" className="btn btn-secondary mt-6">
          Check my posts
        </Link>
      </div>
    </div>
  );
}
