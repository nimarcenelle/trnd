import { updateHandlesAction } from "@/lib/actions";
import type { Rival } from "@/lib/db/types";

import SubmitButton from "./submit-button";

/** Set or fix a company's Instagram and TikTok handles. */
export default function HandlesForm({ rival, compact = false }: { rival: Rival; compact?: boolean }) {
  return (
    <form action={updateHandlesAction} className={`flex flex-col sm:flex-row gap-2 ${compact ? "" : "items-end"}`}>
      <input type="hidden" name="id" value={rival.id} />
      <label className="flex-1 flex flex-col gap-1.5">
        {!compact && <span className="text-[12.5px] font-medium text-ink-2">Instagram</span>}
        <input className="input" name="instagram" defaultValue={rival.instagram ?? ""} placeholder="@instagram" aria-label="Instagram handle" />
      </label>
      <label className="flex-1 flex flex-col gap-1.5">
        {!compact && <span className="text-[12.5px] font-medium text-ink-2">TikTok</span>}
        <input className="input" name="tiktok" defaultValue={rival.tiktok ?? ""} placeholder="@tiktok" aria-label="TikTok handle" />
      </label>
      <SubmitButton className="btn btn-secondary" pending="Saving…">
        Save
      </SubmitButton>
    </form>
  );
}
