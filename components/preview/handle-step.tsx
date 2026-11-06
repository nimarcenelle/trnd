"use client";

import Script from "next/script";
import { useActionState } from "react";

import SubmitButton from "@/components/app/submit-button";
import { startPreviewAction, type StartState } from "@/lib/preview/actions";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/** The first screen's one question: the handle, big, typed straight in. Starts the free read. */
export default function HandleStep({ src }: { src?: string }) {
  const [state, action] = useActionState<StartState, FormData>(startPreviewAction, {});
  return (
    <form action={action} className="grid gap-6 w-full">
      {src && <input type="hidden" name="src" value={src} />}
      <label className="flex items-baseline gap-1 border-b-2 border-line-strong focus-within:border-ink transition-colors pb-2">
        <span className="text-[30px] sm:text-[40px] font-medium text-ink-3">@</span>
        <input
          name="handle"
          size={1}
          placeholder="yourhandle"
          aria-label="Your TikTok handle"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          required
          className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[30px] sm:text-[40px] font-medium tracking-[-0.02em] placeholder:text-ink-3/50"
        />
      </label>
      {SITE_KEY && (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
          <div className="cf-turnstile" data-sitekey={SITE_KEY} data-size="flexible" data-appearance="interaction-only" />
        </>
      )}
      {state.error && <p className="form-error !m-0">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className="btn btn-primary btn-lg" pending="Reading…">
          Check my posts
        </SubmitButton>
        <span className="caption max-sm:hidden">
          press <b>Enter ↵</b>
        </span>
      </div>
    </form>
  );
}
