import { removeRivalAction } from "@/lib/actions";
import type { Rival } from "@/lib/db/types";

import SubmitButton from "./submit-button";

/** The rivals being watched, each removable. */
export default function RivalList({ rivals }: { rivals: Rival[] }) {
  if (!rivals.length) return <p className="text-ink-soft">No rivals yet. Add one below.</p>;
  return (
    <ul className="list-none p-0 m-0 divide-y divide-line">
      {rivals.map((r) => (
        <li key={r.id} className="py-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-semibold">
              {r.name}
              {r.website && <span className="text-ink-faint font-normal text-[13px]"> · {r.website}</span>}
            </div>
            {r.reason && <p className="m-0 text-[13px] text-ink-soft">{r.reason}</p>}
            {r.last_error && <p className="m-0 text-[13px] text-red">{r.last_error}</p>}
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
