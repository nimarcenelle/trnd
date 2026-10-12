import { removeRivalAction } from "@/lib/actions";
import type { Rival } from "@/lib/db/types";

import SubmitButton from "./submit-button";

/** The rivals being watched, one camera each, each removable. */
export default function RivalList({ rivals }: { rivals: Rival[] }) {
  if (!rivals.length) return <p className="p-5 text-ink-2">No rivals yet. Add one below.</p>;
  return (
    <ul className="list-none p-0 m-0 divide-y divide-line">
      {rivals.map((r, i) => (
        <li key={r.id} className="p-4 sm:p-5 grid grid-cols-[52px_minmax(0,1fr)_auto] gap-x-3 items-start">
          <span className="font-mono text-[11px] text-ink-3 pt-1">CAM {String(i + 1).padStart(2, "0")}</span>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-semibold">{r.name}</span>
              {r.website && <span className="text-ink-3 text-[13px]">{r.website}</span>}
              {r.source === "owner" && <span className="tag">Added by you</span>}
            </div>
            {r.reason && <p className="text-[13.5px] text-ink-2 mt-1 leading-[1.5]">{r.reason}</p>}
            {r.last_error && <p className="text-[13px] text-rec mt-1">{r.last_error}</p>}
          </div>
          <form action={removeRivalAction}>
            <input type="hidden" name="id" value={r.id} />
            <SubmitButton className="btn btn-quiet btn-sm" pending="…">
              Remove
            </SubmitButton>
          </form>
        </li>
      ))}
    </ul>
  );
}
