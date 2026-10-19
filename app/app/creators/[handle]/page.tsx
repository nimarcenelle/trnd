import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import Avatar from "@/components/app/avatar";
import { PeerVideos } from "@/components/app/views";
import { removePeerAction } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth/session";
import { borrowScore, followerChange, normalOf } from "@/lib/creators/stats";
import { getCreator, listFollowers, listPeers, listVideos } from "@/lib/data";
import { compact, profileUrl, signed, withinDays } from "@/lib/format";

export const metadata = { title: "Creator — TRND for creators" };

/** One creator like you: their numbers and their recent videos, ranked by how worth borrowing each is. */
export default async function PeerPage({ params }: PageProps<"/app/creators/[handle]">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const creator = await getCreator(user.id);
  if (!creator) redirect("/app/setup");
  const { handle } = await params;
  const peers = await listPeers(creator.id);
  const peer = peers.find((p) => p.handle === decodeURIComponent(handle));
  if (!peer) notFound();
  const [videos, followers] = await Promise.all([listVideos(creator.id, { author: peer.handle, days: 90 }), listFollowers(creator.id, 60)]);
  const normal = normalOf(videos);
  const growth = followerChange(followers.filter((f) => f.handle === peer.handle));
  const rows = videos
    .filter((v) => v.posted_at && withinDays(v.posted_at, 30))
    .map((v) => ({ v, ...borrowScore(v, normal, creator.hashtags) }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="grid gap-5 max-w-[760px]">
      <Link href="/app?tab=creators" className="caption hover:text-ink">
        ← Creators like you
      </Link>
      <div className="flex gap-3 items-center justify-between flex-wrap">
        <div className="flex gap-3 items-center min-w-0">
          <Avatar name={peer.handle} size={44} />
          <div className="min-w-0">
            <h1 className="heading text-[22px] break-all">@{peer.handle}</h1>
            <a href={profileUrl(peer.handle)} target="_blank" rel="noreferrer" className="caption hover:text-ink">
              Open on TikTok ↗
            </a>
          </div>
        </div>
        <form action={removePeerAction}>
          <input type="hidden" name="id" value={peer.id} />
          <button className="btn btn-sm" type="submit">
            Stop following
          </button>
        </form>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-px bg-line border border-line rounded-[14px] overflow-hidden">
        {[
          ["Followers", compact(peer.followers)],
          ["30 days", growth ? signed(growth.change) : "—"],
          ["Usual views", compact(normal.views)],
          ["Saves / 1K", normal.savesPerK ?? "—"],
        ].map(([k, v]) => (
          <div key={k} className="bg-surface px-3.5 py-3">
            <span className="label">{k}</span>
            <strong className="block display !font-semibold text-[20px] mt-1 tnum">{v}</strong>
          </div>
        ))}
      </div>
      <h2 className="heading text-[18px]">Their last 30 days, most worth borrowing first</h2>
      {rows.length ? <PeerVideos rows={rows} /> : <div className="card p-5 text-ink-2">No videos from the last 30 days yet.</div>}
    </div>
  );
}
