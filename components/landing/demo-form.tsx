"use client";

import { useActionState } from "react";

import { submitDemoRequestAction, type DemoRequestState } from "@/lib/marketing/actions";

export default function DemoForm() {
  const [state, formAction, pending] = useActionState<DemoRequestState, FormData>(
    submitDemoRequestAction,
    {},
  );

  if (state.ok) {
    return (
      <div className="demo-success" role="status">
        <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="23" fill="none" stroke="#1EA7AE" strokeWidth="2" />
          <path
            d="M14 25L21 32L34 17"
            stroke="#1EA7AE"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
        <h3>Request received.</h3>
        <p>We&apos;ll follow up within one business day with your live example and a time to talk.</p>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate>
      <div className="field-row">
        <div className="field">
          <label htmlFor="fName">Full name</label>
          <input id="fName" name="full_name" type="text" placeholder="Jordan Lee" autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="fEmail">Work email</label>
          <input id="fEmail" name="email" type="email" placeholder="jordan@yourbusiness.com" autoComplete="email" />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="fBiz">Business name</label>
          <input id="fBiz" name="business_name" type="text" placeholder="Corner Coffee Co." autoComplete="organization" />
        </div>
        <div className="field">
          <label htmlFor="fSite">Website — we&apos;ll build your sample from it</label>
          <input id="fSite" name="website" type="text" inputMode="url" placeholder="yourbusiness.com" autoComplete="url" />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="fCat">What&apos;s your business</label>
          <input
            id="fCat"
            name="category"
            type="text"
            maxLength={60}
            placeholder="e.g. Contrast therapy & recovery studio"
          />
        </div>
        <div className="field">
          <label htmlFor="fSpend">Monthly ad spend</label>
          <select id="fSpend" name="monthly_spend" defaultValue="">
            <option value="">Select a range</option>
            <option>Not spending yet</option>
            <option>Under $1,000</option>
            <option>$1,000 – $5,000</option>
            <option>$5,000 – $20,000</option>
            <option>$20,000+</option>
          </select>
        </div>
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      <button
        type="submit"
        className="btn btn-primary w-full justify-center mt-[6px]"
        disabled={pending}
       
      >
        {pending ? "Sending…" : "Request a demo"}
      </button>
    </form>
  );
}
