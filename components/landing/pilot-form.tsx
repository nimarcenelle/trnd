"use client";

import { useActionState } from "react";

import { submitPilotApplicationAction, type PilotApplicationState } from "@/lib/marketing/actions";
import { OBJECTIVE_OPTIONS } from "@/lib/onboarding/context";

/**
 * The pilot's front door. It asks for what the pilot needs to be useful:
 * a brand that already runs Meta ads, produces creative, and can share
 * results. It promises only what a founder can keep: a reply by email.
 */
export default function PilotForm() {
  const [state, formAction, pending] = useActionState<PilotApplicationState, FormData>(submitPilotApplicationAction, {});

  if (state.ok) {
    return (
      <div className="demo-success" role="status">
        <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="23" fill="none" stroke="#1EA7AE" strokeWidth="2" />
          <path d="M14 25L21 32L34 17" stroke="#1EA7AE" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
        <h3>Application received.</h3>
        <p>We read every application and reply by email. If it is a fit, the reply has a time to talk and what to have ready.</p>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate>
      <div className="field-row">
        <div className="field">
          <label htmlFor="pName">Your name</label>
          <input id="pName" name="full_name" type="text" placeholder="Jordan Lee" autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="pEmail">Work email</label>
          <input id="pEmail" name="email" type="email" placeholder="jordan@yourbrand.com" autoComplete="email" />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="pBrand">Brand</label>
          <input id="pBrand" name="brand_name" type="text" placeholder="Your brand" autoComplete="organization" />
        </div>
        <div className="field">
          <label htmlFor="pSite">Website</label>
          <input id="pSite" name="website" type="text" inputMode="url" placeholder="yourbrand.com" autoComplete="url" />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="pSpend">Monthly Meta ad spend</label>
          <select id="pSpend" name="monthly_spend" defaultValue="">
            <option value="">Select a range</option>
            <option>Not running ads yet</option>
            <option>Under $5,000</option>
            <option>$5,000 to $20,000</option>
            <option>$20,000 to $100,000</option>
            <option>$100,000+</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>What your campaigns optimize for</label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="What your campaigns optimize for">
          {OBJECTIVE_OPTIONS.map((o) => (
            <label key={o.value} className="cb__refine-opt has-[:checked]:border-(--amber) has-[:checked]:bg-(--amber-softer) has-[:checked]:font-semibold">
              <input type="checkbox" name="objective" value={o.value} />
              {o.label}
            </label>
          ))}
        </div>
        <p className="text-[12px] text-ink-faint mx-0 mt-[6px] mb-0">Tick every campaign type you run.</p>
      </div>
      <div className="field">
        <label htmlFor="pProduction">Who makes your creative?</label>
        <input id="pProduction" name="production" type="text" maxLength={200} placeholder="e.g. A freelance creator monthly and an in-house editor" />
      </div>
      <div className="field">
        <label htmlFor="pNext">What did you make last, and what are you stuck on next?</label>
        <textarea id="pNext" name="what_next" rows={3} maxLength={800} placeholder="A sentence or two is plenty." />
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      <button type="submit" className="btn btn-primary w-full justify-center mt-[6px]" disabled={pending}>
        {pending ? "Sending…" : "Apply for the pilot"}
      </button>
      <p className="text-[11.5px] text-ink-faint mx-0 mt-3 mb-0 text-center leading-[1.5]">
        The pilot is $500 for one month, billed only once we have agreed it is a fit. No card here.
      </p>
    </form>
  );
}
