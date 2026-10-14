"use client";

import { useActionState } from "react";

import { updateProfileAction, type FormState } from "@/lib/actions";
import type { BrandProfile } from "@/lib/db/types";

import SubmitButton from "./submit-button";

const area = "input !h-auto py-2 leading-[1.5] resize-y";

/** The owner's corrections to the brand profile. Lists are one item per line. */
export default function ProfileForm({ profile }: { profile: BrandProfile | null }) {
  const [state, action] = useActionState<FormState & { saved?: boolean }, FormData>(updateProfileAction, {});
  const p = profile;
  const join = (xs?: string[]) => (xs ?? []).join("\n");
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <label className="field !mb-0 sm:col-span-2">
        <span className="text-[13px] font-medium">What you sell</span>
        <input className="input" name="what_it_sells" defaultValue={p?.what_it_sells ?? ""} />
      </label>
      <label className="field !mb-0">
        <span className="text-[13px] font-medium">Price point</span>
        <input className="input" name="price_point" defaultValue={p?.price_point ?? ""} placeholder="$79 filter, $25 refills" />
      </label>
      <label className="field !mb-0">
        <span className="text-[13px] font-medium">Price tier</span>
        <select className="input" name="price_tier" defaultValue={p?.price_tier ?? "unknown"}>
          <option value="budget">Budget</option>
          <option value="mid">Mid</option>
          <option value="premium">Premium</option>
          <option value="unknown">Not sure</option>
        </select>
      </label>
      <label className="field !mb-0 sm:col-span-2">
        <span className="text-[13px] font-medium">Who it&apos;s for</span>
        <input className="input" name="audience" defaultValue={p?.audience ?? ""} />
      </label>
      <label className="field !mb-0">
        <span className="text-[13px] font-medium">Main promises</span>
        <textarea className={area} rows={4} name="value_props" defaultValue={join(p?.value_props)} placeholder="One per line" />
      </label>
      <label className="field !mb-0">
        <span className="text-[13px] font-medium">What makes you different</span>
        <textarea className={area} rows={4} name="differentiators" defaultValue={join(p?.differentiators)} placeholder="One per line" />
      </label>
      <label className="field !mb-0">
        <span className="text-[13px] font-medium">Proof (reviews, press, guarantees)</span>
        <textarea className={area} rows={3} name="proof_points" defaultValue={join(p?.proof_points)} placeholder="One per line" />
      </label>
      <label className="field !mb-0">
        <span className="text-[13px] font-medium">Current offers</span>
        <textarea className={area} rows={3} name="offers" defaultValue={join(p?.offers)} placeholder="One per line" />
      </label>
      <label className="field !mb-0 sm:col-span-2">
        <span className="text-[13px] font-medium">Tone of voice</span>
        <input className="input" name="tone" defaultValue={p?.tone ?? ""} />
      </label>
      <div className="sm:col-span-2 flex items-center gap-3">
        <SubmitButton className="btn btn-primary" pending="Saving…">
          Save profile
        </SubmitButton>
        {state.saved && <span className="text-[13px] text-pos">Saved. The next report uses it.</span>}
        {state.error && <span className="form-error !m-0">{state.error}</span>}
      </div>
    </form>
  );
}
