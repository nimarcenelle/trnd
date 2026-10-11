"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { startFromUrlAction, type UrlStartState } from "@/lib/onboarding/from-url";

/** Set by the landing page's read, so the store someone just read is already here. */
export const LAST_READ_KEY = "trnd-read-site";

const STEPS = ["Reading your site", "Finding your socials", "Looking up your live ads", "Naming your competitors"];

/**
 * Onboarding as one field. While the site is read, the steps tick by so
 * the half minute reads as work being done, not a frozen button.
 */
/**
 * `site` is the store carried in from signup (?site=): the field is filled
 * and submitted on its own, so the person who just ran a free read never
 * types the address twice.
 */
export default function UrlStart({ site }: { site?: string }) {
  const [state, action, pending] = useActionState<UrlStartState, FormData>(startFromUrlAction, {});
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const started = useRef(false);
  const [step, setStep] = useState(0);

  // Prefilled outside React's state: the server renders an empty field and
  // the stored store lands after hydration without a second render. A
  // carried site also submits itself, once: an error stops the loop.
  useEffect(() => {
    try {
      const last = site || localStorage.getItem(LAST_READ_KEY);
      if (last && input.current && !input.current.value) input.current.value = last;
    } catch {
      /* storage blocked: the field just starts empty */
    }
    if (site && !started.current) {
      started.current = true;
      form.current?.requestSubmit();
    }
  }, [site]);

  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 6000);
    return () => clearInterval(t);
  }, [pending]);

  return (
    <form ref={form} action={action} className="ob-url" onSubmit={() => setStep(0)}>
      <div className="rd-command">
        <span className="rd-command__prefix" aria-hidden="true">
          https://
        </span>
        <label htmlFor="ob-site" className="sr-only">
          Your store&rsquo;s address
        </label>
        <input
          id="ob-site"
          name="website"
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          placeholder="yourbrand.com"
          ref={input}
          defaultValue={site ?? ""}
          disabled={pending}
          required
        />
        <button type="submit" className="rd-btn rd-btn--gold" disabled={pending}>
          {pending ? (
            <>
              <span className="rd-spin" aria-hidden="true" /> Setting up
            </>
          ) : (
            <>Start watching</>
          )}
        </button>
      </div>
      {pending ? (
        <ol className="ob-steps" aria-live="polite">
          {STEPS.map((s, i) => (
            <li key={s} className={i < step ? "is-done" : i === step ? "is-active" : undefined}>
              <i aria-hidden="true" />
              {s}
            </li>
          ))}
        </ol>
      ) : state.error ? (
        <p className="rd-alert rd-alert--error ob-error">{state.error}</p>
      ) : (
        <p className="rd-fine ob-note">About thirty seconds. We read your site, your socials and your live ads, then name your competitors and start reading theirs.</p>
      )}
    </form>
  );
}
