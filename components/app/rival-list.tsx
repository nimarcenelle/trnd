import { removeRivalAction } from "@/lib/actions";
import type { Rival } from "@/lib/db/types";
import { isNoPageNote } from "@/lib/format";

import Avatar from "./avatar";
import HandlesForm from "./handles-form";
import SubmitButton from "./submit-button";

/** The rivals being watched, each removable. */
export default function RivalList({ rivals, social = false }: { rivals: Rival[]; social?: boolean }) {
  if (!rivals.length) return <p className="p-5 text-[13.5px] text-ink-2">No competitors yet. Add one below.</p>;
  return (
    <ul className="list-none p-0 m-0 divide-y divide-line">
      {rivals.map((r) => (
        <li key={r.id} className="px-4 py-3.5 flex items-start gap-3">
          <Avatar name={r.name} size={32} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[14px] font-semibold">{r.name}</span>
              {r.website && <span className="text-[12.5px] text-ink-3">{r.website}</span>}
              {r.source === "owner" && <span className="badge">Added by you</span>}
            </div>
            {r.reason && <p className="text-[13px] text-ink-2 mt-0.5 leading-[1.5]">{r.reason}</p>}
            {r.last_error && <p className={`text-[12.5px] mt-1 ${isNoPageNote(r.last_error) ? "text-ink-3" : "text-neg"}`}>{r.last_error}</p>}
            {social && (
              <details className="mt-1.5 group">
                <summary className="text-[12.5px] text-ink-3 hover:text-ink">
                  {r.instagram || r.tiktok ? [r.instagram && `IG @${r.instagram}`, r.tiktok && `TikTok @${r.tiktok}`].filter(Boolean).join(" · ") : "Add Instagram / TikTok"}
                </summary>
                <div className="mt-2">
                  <HandlesForm rival={r} compact />
                </div>
              </details>
            )}
          </div>
          <form action={removeRivalAction}>
            <input type="hidden" name="id" value={r.id} />
            <SubmitButton className="btn btn-ghost btn-sm" pending="…">
              Remove
            </SubmitButton>
          </form>
        </li>
      ))}
    </ul>
  );
}
