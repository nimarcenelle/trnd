import type { SocialProfile } from "@/lib/db/types";
import { ago, compact, percent, profileUrl } from "@/lib/format";
import type { Growth } from "@/lib/social/read";

import { IconArrowUpRight } from "@/components/icons";

const LABEL = { instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" } as const;

/** One company's presence on one platform: size, growth, cadence, engagement and its best recent posts. */
export default function SocialCard({ profile, growth }: { profile: SocialProfile; growth?: Growth | null }) {
  const delta = growth && growth.days > 0 ? growth.to - growth.from : null;
  const top = [...profile.recent].sort((a, b) => (b.likes ?? 0) + (b.views ?? 0) / 20 - ((a.likes ?? 0) + (a.views ?? 0) / 20)).slice(0, 3);
  return (
    <div className="card p-5 flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-ink-2">{LABEL[profile.platform]}</div>
          <a href={profileUrl(profile.platform, profile.handle)} target="_blank" rel="noreferrer" className="text-[14px] font-semibold hover:underline inline-flex items-center gap-1">
            @{profile.handle} <IconArrowUpRight className="text-ink-3" />
          </a>
        </div>
        {profile.fetched_at && <span className="caption shrink-0">Read {ago(profile.fetched_at)}</span>}
      </div>
      {profile.error ? (
        <p className="text-[13px] text-ink-3 mt-4">{profile.error}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div>
              <div className="caption">Followers</div>
              <div className="text-[20px] font-semibold tnum mt-0.5">{compact(profile.followers)}</div>
              {delta !== null && (
                <div className={`text-[12px] tnum ${delta > 0 ? "text-pos" : delta < 0 ? "text-neg" : "text-ink-3"}`}>
                  {delta > 0 ? "+" : ""}
                  {compact(delta)} in {growth!.days}d
                </div>
              )}
            </div>
            <div>
              <div className="caption">Posts / week</div>
              <div className="text-[20px] font-semibold tnum mt-0.5">{profile.posts_per_week ?? "—"}</div>
            </div>
            <div>
              <div className="caption">Engagement</div>
              <div className="text-[20px] font-semibold tnum mt-0.5">{percent(profile.engagement_rate, 2)}</div>
            </div>
          </div>
          {top.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="caption mb-1.5">Top recent posts</div>
              <ul className="list-none m-0 p-0 flex flex-col gap-1.5">
                {top.map((p, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                    <a href={p.url ?? undefined} target="_blank" rel="noreferrer" className="truncate text-ink-2 hover:text-ink">
                      {p.caption || "(no caption)"}
                    </a>
                    <span className="shrink-0 tnum text-ink-3">
                      {p.views ? `${compact(p.views)} views` : `${compact(p.likes)} likes`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
