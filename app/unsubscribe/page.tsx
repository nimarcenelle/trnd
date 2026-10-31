import Link from "next/link";

import Brand from "@/components/brand";
import { unsubscribeTokenOk } from "@/lib/auth/unsubscribe";

export const metadata = { title: "Weekly plan emails — TRND for creators", robots: { index: false } };

/**
 * The plan email's "Stop these emails" link lands here. It asks before turning
 * anything off, so a mail scanner opening the link changes nothing.
 */
export default async function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  const { c, t, done } = await searchParams;
  const creatorId = typeof c === "string" ? c : "";
  const token = typeof t === "string" ? t : "";
  const valid = unsubscribeTokenOk(creatorId, token);

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-6 px-6 text-center">
      <Brand />
      {done ? (
        <div className="max-w-[420px]">
          <h1 className="heading text-[24px]">Done. No more weekly plan emails.</h1>
          <p className="text-ink-2 mt-2">Your plan still lands in the app every week. Turn the email back on any time in Settings.</p>
        </div>
      ) : valid ? (
        <div className="max-w-[420px] grid gap-5 justify-items-center">
          <div>
            <h1 className="heading text-[24px]">Stop the weekly plan email?</h1>
            <p className="text-ink-2 mt-2">You&apos;ll still get sign-in codes and billing emails. Your plan stays in the app.</p>
          </div>
          <form method="post" action={`/api/unsubscribe?c=${encodeURIComponent(creatorId)}&t=${encodeURIComponent(token)}&from=page`}>
            <button type="submit" className="btn btn-primary">
              Stop these emails
            </button>
          </form>
        </div>
      ) : (
        <div className="max-w-[420px]">
          <h1 className="heading text-[24px]">This link doesn&apos;t work</h1>
          <p className="text-ink-2 mt-2">It may be cut short. You can turn the weekly email off in Settings.</p>
        </div>
      )}
      <Link href="/app/settings#emails" className="text-[14px] text-ink-2 underline">
        Email settings
      </Link>
    </main>
  );
}
