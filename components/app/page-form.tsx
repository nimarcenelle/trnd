"use client";

import { useActionState } from "react";

import { setPageAction, type FormState } from "@/lib/actions";

import SubmitButton from "./submit-button";

/** Name a company's Facebook Page by pasting its link, when we found none or the wrong one. */
export default function PageForm({ rivalId, compact = false }: { rivalId: string; compact?: boolean }) {
  const [state, action] = useActionState<FormState & { saved?: boolean }, FormData>(setPageAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="id" value={rivalId} />
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          className={`input flex-1 ${compact ? "h-8 text-[13px]" : ""}`}
          name="page"
          placeholder="facebook.com/theirpage or an Ad Library link"
          aria-label="Facebook Page link"
          required
        />
        <SubmitButton className={`btn btn-secondary ${compact ? "btn-sm" : ""}`} pending="Finding…">
          Use this Page
        </SubmitButton>
      </div>
      {state.error && <p className="form-error mt-2">{state.error}</p>}
      {state.saved && <p className="text-[12.5px] text-pos mt-2">Saved. Reading their ads now.</p>}
    </form>
  );
}
