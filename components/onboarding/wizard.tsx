"use client";

import { useActionState, useMemo, useState } from "react";

import { completeOnboardingAction, type OnboardingState } from "@/lib/onboarding/actions";
import { CATEGORIES } from "@/lib/db/types";

const STEPS = ["Business", "Category", "Location", "Services", "Voice"] as const;

interface ServiceRow {
  name: string;
  price: string;
}

export default function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(
    completeOnboardingAction,
    {},
  );

  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [radius, setRadius] = useState(20);
  const [priceBand, setPriceBand] = useState("$$");
  const [services, setServices] = useState<ServiceRow[]>([{ name: "", price: "" }]);
  const [voice, setVoice] = useState("");

  const canNext = useMemo(() => {
    if (step === 0) return name.trim().length > 0;
    if (step === 1) return category.length > 0;
    if (step === 2) return city.trim().length > 0;
    if (step === 3) return services.some((s) => s.name.trim().length > 0);
    return true;
  }, [step, name, category, city, services]);

  function setService(i: number, patch: Partial<ServiceRow>) {
    setServices((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="card-lg" style={{ maxWidth: 620, width: "100%", padding: "36px 34px" }}>
      {/* progress rail */}
      <div style={{ display: "flex", gap: 6, marginBottom: 30 }}>
        {STEPS.map((label, i) => (
          <div key={label} style={{ flex: 1 }}>
            <div
              style={{
                height: 4,
                borderRadius: 2,
                background: i <= step ? "var(--amber)" : "var(--line-strong)",
                transition: "background .2s ease",
              }}
            />
            <span
              className="mono-label"
              style={{ fontSize: 9.5, marginTop: 6, display: "block", color: i <= step ? "var(--amber)" : undefined }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      <form action={formAction}>
        {/* Everything submits together at the end; steps just show/hide. */}
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="website" value={website} />
        <input type="hidden" name="category" value={category} />
        <input type="hidden" name="city" value={city} />
        <input type="hidden" name="region" value={region} />
        <input type="hidden" name="radius_miles" value={radius} />
        <input type="hidden" name="price_band" value={priceBand} />
        <input type="hidden" name="services" value={JSON.stringify(services)} />
        <input type="hidden" name="brand_voice_notes" value={voice} />

        {step === 0 && (
          <section>
            <h2 className="h-disp" style={{ fontSize: 22, margin: "0 0 6px" }}>What&apos;s your business called?</h2>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", margin: "0 0 22px" }}>As customers know it.</p>
            <div className="field">
              <label htmlFor="ob-name">Business name</label>
              <input id="ob-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Corner Coffee Co." autoFocus />
            </div>
            <div className="field">
              <label htmlFor="ob-web">Website (optional)</label>
              <input id="ob-web" type="text" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="cornercoffee.com" />
            </div>
          </section>
        )}

        {step === 1 && (
          <section>
            <h2 className="h-disp" style={{ fontSize: 22, margin: "0 0 6px" }}>What kind of business?</h2>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", margin: "0 0 22px" }}>This decides which demand signals TRND watches for you.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }} role="radiogroup" aria-label="Business category">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={category === c}
                  onClick={() => setCategory(c)}
                  className="pill"
                  style={
                    category === c
                      ? { background: "var(--amber)", color: "var(--amber-ink)", borderColor: "var(--amber)", cursor: "pointer", fontWeight: 600 }
                      : { cursor: "pointer", background: "var(--bg-1)" }
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <h2 className="h-disp" style={{ fontSize: 22, margin: "0 0 6px" }}>Where do customers find you?</h2>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", margin: "0 0 22px" }}>Signal gets read for your area, not the whole internet.</p>
            <div className="field-row">
              <div className="field">
                <label htmlFor="ob-city">City</label>
                <input id="ob-city" type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Atlanta" />
              </div>
              <div className="field">
                <label htmlFor="ob-region">State / region</label>
                <input id="ob-region" type="text" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="GA" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="ob-radius">Radius — {radius} miles</label>
              <input id="ob-radius" type="range" min={5} max={60} step={5} value={radius} onChange={(e) => setRadius(Number(e.target.value))} style={{ accentColor: "var(--amber)", padding: 0, background: "transparent", border: "none" }} />
            </div>
            <div className="field">
              <label htmlFor="ob-price">Price band</label>
              <select id="ob-price" value={priceBand} onChange={(e) => setPriceBand(e.target.value)}>
                <option value="$">$ — budget-friendly</option>
                <option value="$$">$$ — mid-range</option>
                <option value="$$$">$$$ — premium</option>
              </select>
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <h2 className="h-disp" style={{ fontSize: 22, margin: "0 0 6px" }}>What do you sell?</h2>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", margin: "0 0 22px" }}>TRND only recommends promoting things you actually offer.</p>
            {services.map((row, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 130px 40px", gap: 10, marginBottom: 12 }}>
                <input aria-label={`Service ${i + 1} name`} type="text" value={row.name} onChange={(e) => setService(i, { name: e.target.value })} placeholder="e.g. Facial balancing consult" style={{ fontFamily: "var(--body)", fontSize: 14.5, background: "var(--bg-2)", border: "1px solid var(--line-strong)", color: "var(--ink)", padding: "12px 14px", borderRadius: "var(--radius-sm)" }} />
                <input aria-label={`Service ${i + 1} price`} type="text" value={row.price} onChange={(e) => setService(i, { price: e.target.value })} placeholder="$ price" style={{ fontFamily: "var(--body)", fontSize: 14.5, background: "var(--bg-2)", border: "1px solid var(--line-strong)", color: "var(--ink)", padding: "12px 14px", borderRadius: "var(--radius-sm)" }} />
                <button type="button" aria-label={`Remove service ${i + 1}`} onClick={() => setServices((r) => r.filter((_, idx) => idx !== i))} disabled={services.length === 1} style={{ background: "none", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", color: "var(--ink-faint)", cursor: "pointer" }}>
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setServices((r) => [...r, { name: "", price: "" }])}>
              + Add another
            </button>
          </section>
        )}

        {step === 4 && (
          <section>
            <h2 className="h-disp" style={{ fontSize: 22, margin: "0 0 6px" }}>How do you sound?</h2>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", margin: "0 0 22px" }}>
              Optional — a sentence or two so generated copy sounds like you, not like everyone else.
            </p>
            <div className="field">
              <label htmlFor="ob-voice">Brand voice notes</label>
              <textarea id="ob-voice" rows={4} value={voice} onChange={(e) => setVoice(e.target.value)} placeholder='e.g. "Warm but direct. We never discount, we add value. No exclamation marks."' />
            </div>
          </section>
        )}

        {state.error && <p className="form-error">{state.error}</p>}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep((s) => Math.max(0, s - 1))} style={{ visibility: step === 0 ? "hidden" : "visible" }}>
            ← Back
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary btn-sm" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
              Continue →
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Setting up…" : "Finish setup"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
