"use client";

import Script from "next/script";
import { useActionState } from "react";

import SubmitButton from "@/components/app/submit-button";
import { startPreviewAction, type StartState } from "@/lib/preview/actions";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/** The handle box that starts a free preview: no account, no TikTok login. */
export default function StartForm({ cta = "Analyze my TikTok", defaultHandle, compact = false }: { cta?: string; defaultHandle?: string; compact?: boolean }) {
  const [state, action] = useActionState<StartState, FormData>(startPreviewAction, {});
  return (
    <form action={action} className="grid gap-2 w-full">
      <div className="handlebox">
        <span className="at">@</span>
        <input name="handle" size={1} defaultValue={defaultHandle} placeholder="yourhandle" aria-label="Your TikTok handle" autoComplete="off" autoCapitalize="none" spellCheck={false} required />
        <SubmitButton className="btn btn-primary" pending="Starting…">
          {cta}
        </SubmitButton>
      </div>
      {SITE_KEY && (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
          <div className="cf-turnstile" data-sitekey={SITE_KEY} data-size="flexible" data-appearance="interaction-only" />
        </>
      )}
      {state.error ? (
        <p className="form-error !m-0 ml-5">{state.error}</p>
      ) : (
        !compact && <p className="caption ml-5">Free. No TikTok login, no password. We only read your public videos.</p>
      )}
    </form>
  );
}
