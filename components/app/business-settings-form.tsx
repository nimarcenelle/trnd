"use client";

import { useActionState } from "react";

import type { Business } from "@/lib/db/types";
import { CATEGORIES } from "@/lib/db/types";
import { ONLINE_CATEGORIES } from "@/lib/onboarding/market";
import { updateBusinessAction, type SettingsState } from "@/lib/settings/actions";

export default function BusinessSettingsForm({ business }: { business: Business }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    updateBusinessAction,
    {},
  );
  // An online brand has no radius and no city its ads are bound to. The
  // fields still post their stored values, so saving the rest never clears them.
  const online = business.market === "online";
  const suggestions: readonly string[] = online ? ONLINE_CATEGORIES : CATEGORIES;

  return (
    <form action={formAction}>
      <div className="field-row">
        <div className="field">
          <label htmlFor="st-name">Business name</label>
          <input id="st-name" name="name" defaultValue={business.name} />
        </div>
        <div className="field">
          <label htmlFor="st-cat">What you are</label>
          <input
            id="st-cat"
            name="category"
            defaultValue={business.category}
            maxLength={60}
            placeholder={online ? "e.g. Barrier-repair skincare" : "e.g. Contrast therapy & recovery studio"}
            list="st-cat-suggestions"
          />
          <datalist id="st-cat-suggestions">
            {suggestions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>
      {online ? (
        <>
          <input type="hidden" name="city" value={business.city} />
          <input type="hidden" name="region" value={business.region ?? ""} />
          <input type="hidden" name="radius_miles" value={business.radius_miles} />
        </>
      ) : (
        <div className="field-row">
          <div className="field">
            <label htmlFor="st-city">City</label>
            <input id="st-city" name="city" defaultValue={business.city} />
          </div>
          <div className="field">
            <label htmlFor="st-region">State / region</label>
            <input id="st-region" name="region" defaultValue={business.region ?? ""} />
          </div>
        </div>
      )}
      <div className="field-row">
        {!online && (
          <div className="field">
            <label htmlFor="st-radius">Radius (miles)</label>
            <input id="st-radius" name="radius_miles" type="number" min={1} max={100} defaultValue={business.radius_miles} />
          </div>
        )}
        <div className="field">
          <label htmlFor="st-price">Price band</label>
          <select id="st-price" name="price_band" defaultValue={business.price_band ?? "$$"}>
            <option value="$">$ — budget-friendly</option>
            <option value="$$">$$ — mid-range</option>
            <option value="$$$">$$$ — premium</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="st-web">Website</label>
        <input id="st-web" name="website" defaultValue={business.website ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="st-voice">Brand voice notes</label>
        <textarea id="st-voice" name="brand_voice_notes" rows={3} defaultValue={business.brand_voice_notes ?? ""} />
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      <div className="flex gap-3 items-center">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        {state.ok && (
          <span className="font-mono text-[11.5px] text-mint">Saved ✓</span>
        )}
      </div>
    </form>
  );
}
