"use client";

import { useActionState } from "react";

import { uploadResultsAction, type FormState } from "@/lib/actions";

import SubmitButton from "./submit-button";

/** Upload an Ads Manager export; it replaces the previous one. */
export default function ResultsUpload({ hasResults }: { hasResults: boolean }) {
  const [state, action] = useActionState<FormState & { count?: number }, FormData>(uploadResultsAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="text-[13px] text-ink-2 file:mr-3 file:h-9 file:px-3.5 file:rounded-lg file:border file:border-line-strong file:bg-bg file:text-ink file:font-medium file:text-[13px] file:cursor-pointer hover:file:bg-subtle"
        />
        <SubmitButton className="btn btn-primary" pending="Reading…">
          {hasResults ? "Replace results" : "Upload results"}
        </SubmitButton>
      </div>
      {state.count !== undefined && <p className="text-[13px] text-pos">Read {state.count} ads. Run a scan to get advice that uses them.</p>}
      {state.error && <p className="form-error !m-0">{state.error}</p>}
    </form>
  );
}
