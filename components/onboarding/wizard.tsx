"use client";

import { useActionState, useMemo, useRef, useState } from "react";

import { completeOnboardingAction, type OnboardingState } from "@/lib/onboarding/actions";
import { CATEGORIES } from "@/lib/db/types";
import type { ImportEvent, SiteImport } from "@/lib/import/website";

const STEPS = ["Website", "Category", "Location", "Services", "Voice"] as const;

interface ServiceRow {
  name: string;
  price: string;
}

const inputStyle: React.CSSProperties = {
  fontFamily: "var(--body)",
  fontSize: 14.5,
  background: "var(--bg-2)",
  border: "1px solid var(--line-strong)",
  color: "var(--ink)",
  padding: "12px 14px",
  borderRadius: "var(--radius-sm)",
};

export default function OnboardingWizard() {
  // Two paths after the website step: a successful import collapses the rest
  // into one prefilled confirm screen ("review"); otherwise the stepper asks
  // only for what the site couldn't provide.
  const [mode, setMode] = useState<"steps" | "review">("steps");
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
  const [siteText, setSiteText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  // Website import: owner-initiated read of their own site, streamed as
  // NDJSON events so every stage shows up the moment it happens. Heuristics
  // land as a `partial` prefill; the AI pass follows as `final`. Failure is
  // normal — onboarding continues manually.
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [importLog, setImportLog] = useState<string[]>([]);
  const [foundChips, setFoundChips] = useState<string[]>([]);
  // What the import itself wrote, so a later event may refine it but the
  // owner's own typing is never clobbered.
  const importedName = useRef<string | null>(null);
  const importedVoice = useRef<string | null>(null);

  function applyImport(d: SiteImport) {
    if (d.name && (!name.trim() || name === importedName.current)) {
      setName(d.name);
      importedName.current = d.name;
    }
    if (d.category) setCategory(d.category);
    if (d.city) setCity(d.city);
    if (d.region) setRegion(d.region);
    if (d.priceBand) setPriceBand(d.priceBand);
    if (d.services.length > 0) {
      setServices(d.services.map((sv) => ({ name: sv.name, price: sv.price })));
    }
    if (d.voiceHint && (!voice || voice === importedVoice.current)) {
      setVoice(d.voiceHint);
      importedVoice.current = d.voiceHint;
    }
    if ((d.photos ?? []).length > 0) setPhotos(d.photos ?? []);
    const chips = d.services.slice(0, 6).map((sv) => `${sv.name} — $${sv.price}`);
    if (d.services.length > 6) chips.push(`+${d.services.length - 6} more`);
    if (d.city) chips.push(`${d.city}${d.region ? `, ${d.region}` : ""}`);
    setFoundChips(chips);
  }

  function finishImport(d: SiteImport) {
    const found: string[] = [];
    if (d.services.length > 0) found.push(`${d.services.length} offering${d.services.length === 1 ? "" : "s"} with prices`);
    if (d.city) found.push("your location");
    if (d.category) found.push("your category");
    if (d.priceBand) found.push("your price range");
    const gotName = Boolean(name.trim() || d.name);
    setImportNote(
      (found.length > 0
        ? `Read your site — found ${found.join(", ")}. Confirm or edit below, then you're in.`
        : "Read your site — confirm the details below.") +
        (d.services.length === 0 ? " Couldn't read a menu or price list, so add what you sell below." : "") +
        (gotName ? "" : " Add your business name to continue."),
    );
    // Everything on one confirm screen — no more questions than needed.
    if (gotName) setMode("review");
  }

  async function continueFromWebsite() {
    if (!website.trim()) {
      setStep(1);
      return;
    }
    setImporting(true);
    setImportNote(null);
    setImportLog([]);
    setFoundChips([]);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: website }),
      });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("no stream");
      const decoder = new TextDecoder();
      let buffer = "";
      let sawVerdict = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as ImportEvent;
          if (event.type === "status") {
            setImportLog((log) => [...log, event.label]);
          } else if (event.type === "partial") {
            applyImport(event.data);
            setImportLog((log) => [...log, "Pulling out what you sell and what it costs…"]);
          } else if (event.type === "final") {
            applyImport(event.data);
            setSiteText(event.siteText);
            sawVerdict = true;
            finishImport(event.data);
          } else {
            sawVerdict = true;
            setImportNote(event.reason);
            if (name.trim()) setStep(1);
          }
        }
      }
      if (!sawVerdict) {
        // Stream ended without a verdict (connection dropped mid-read).
        setImportNote("Lost the connection while reading the site — fill in the details manually.");
      }
    } catch {
      setImportNote("Couldn't read the site — fill in the details manually.");
      if (name.trim()) setStep(1);
    } finally {
      setImporting(false);
    }
  }

  const canNext = useMemo(() => {
    if (step === 0) return name.trim().length > 0 || website.trim().length > 0;
    if (step === 1) return category.length > 0;
    if (step === 2) return city.trim().length > 0;
    if (step === 3) return services.some((s) => s.name.trim().length > 0);
    return true;
  }, [step, name, website, category, city, services]);

  const canFinish =
    name.trim().length > 0 &&
    category.length > 0 &&
    city.trim().length > 0 &&
    services.some((s) => s.name.trim().length > 0);

  function setService(i: number, patch: Partial<ServiceRow>) {
    setServices((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const categoryPicker = (
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
  );

  const serviceRows = (
    <>
      {services.map((row, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 130px 40px", gap: 10, marginBottom: 12 }}>
          <input aria-label={`Service ${i + 1} name`} type="text" value={row.name} onChange={(e) => setService(i, { name: e.target.value })} placeholder="e.g. Facial balancing consult" style={inputStyle} />
          <input aria-label={`Service ${i + 1} price`} type="text" value={row.price} onChange={(e) => setService(i, { price: e.target.value })} placeholder="$ price" style={inputStyle} />
          <button type="button" aria-label={`Remove service ${i + 1}`} onClick={() => setServices((r) => r.filter((_, idx) => idx !== i))} disabled={services.length === 1} style={{ background: "none", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", color: "var(--ink-faint)", cursor: "pointer" }}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setServices((r) => [...r, { name: "", price: "" }])}>
        + Add another
      </button>
    </>
  );

  const locationFields = (
    <>
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
    </>
  );

  return (
    <div className="card-lg" style={{ maxWidth: 620, width: "100%", padding: "36px 34px" }}>
      {/* progress rail */}
      <div style={{ display: "flex", gap: 6, marginBottom: 30 }}>
        {(mode === "review" ? (["Website", "Confirm"] as const) : STEPS).map((label, i, arr) => {
          const done = mode === "review" || i <= step;
          const isLast = i === arr.length - 1;
          return (
            <div key={label} style={{ flex: 1 }}>
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  background: done ? "var(--amber)" : "var(--line-strong)",
                  transition: "background .2s ease",
                }}
              />
              <span
                className="mono-label"
                style={{ fontSize: 9.5, marginTop: 6, display: "block", color: done ? "var(--amber)" : undefined, textAlign: mode === "review" && isLast ? "right" : undefined }}
              >
                {label}
              </span>
            </div>
          );
        })}
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
        <input type="hidden" name="site_text" value={siteText} />
        <input type="hidden" name="photo_urls" value={JSON.stringify(photos)} />

        {mode === "steps" && step === 0 && (
          <section>
            <h2 className="h-disp" style={{ fontSize: 22, margin: "0 0 6px" }}>Start with your website.</h2>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", margin: "0 0 22px" }}>
              TRND reads your menu, offerings, prices, and location from it — one confirm screen instead of a questionnaire.
            </p>
            <div className="field">
              <label htmlFor="ob-web">Website</label>
              <input id="ob-web" type="text" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourbusiness.com" autoFocus inputMode="url" autoComplete="url" />
            </div>
            <div className="field">
              <label htmlFor="ob-name">Business name</label>
              <input id="ob-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Corner Coffee Co." autoComplete="organization" />
            </div>
            <p style={{ fontSize: 12, color: "var(--ink-faint)", margin: "2px 0 0", lineHeight: 1.5 }}>
              No website? Leave it blank — you can fill everything in by hand.
            </p>
            {(importing || importLog.length > 0) && (
              <div className="import-log" aria-live="polite">
                {importLog.map((line, i) => {
                  const current = importing && i === importLog.length - 1;
                  return (
                    <div key={i} className={`import-log__line${current ? " is-current" : ""}`}>
                      <span className="import-log__mark" aria-hidden="true">{current ? "" : "✓"}</span>
                      <span>{line}</span>
                    </div>
                  );
                })}
                {foundChips.length > 0 && (
                  <div className="import-log__chips">
                    {foundChips.map((chip) => (
                      <span key={chip} className="pill">{chip}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {importNote && (mode === "review" || step > 0 || !importing) && (
          <p
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              lineHeight: 1.5,
              color: importNote.startsWith("Read your site") ? "var(--mint-text)" : "var(--ink-faint)",
              margin: "0 0 18px",
              paddingBottom: 14,
              borderBottom: "1px dashed var(--line)",
            }}
          >
            {importNote}
          </p>
        )}

        {mode === "review" && (
          <section>
            <h2 className="h-disp" style={{ fontSize: 22, margin: "0 0 6px" }}>Confirm what we read.</h2>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", margin: "0 0 22px" }}>
              Everything below came from your site or a sensible default — fix anything that&apos;s off.
            </p>
            <div className="field">
              <label htmlFor="ob-name-r">Business name</label>
              <input id="ob-name-r" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Corner Coffee Co." autoComplete="organization" />
            </div>
            <div className="field">
              <label>Category</label>
              {categoryPicker}
            </div>
            <div style={{ marginTop: 18 }}>{locationFields}</div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>What you sell</label>
            </div>
            {serviceRows}
            <div className="field" style={{ marginTop: 18 }}>
              <label htmlFor="ob-voice-r">Brand voice notes (optional)</label>
              <textarea id="ob-voice-r" rows={3} value={voice} onChange={(e) => setVoice(e.target.value)} placeholder='e.g. "Warm but direct. We never discount, we add value. No exclamation marks."' />
            </div>
          </section>
        )}

        {mode === "steps" && step === 1 && (
          <section>
            <h2 className="h-disp" style={{ fontSize: 22, margin: "0 0 6px" }}>What kind of business?</h2>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", margin: "0 0 22px" }}>This decides which demand signals TRND watches for you.</p>
            {categoryPicker}
          </section>
        )}

        {mode === "steps" && step === 2 && (
          <section>
            <h2 className="h-disp" style={{ fontSize: 22, margin: "0 0 6px" }}>Where do customers find you?</h2>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", margin: "0 0 22px" }}>Signal gets read for your area, not the whole internet.</p>
            {locationFields}
          </section>
        )}

        {mode === "steps" && step === 3 && (
          <section>
            <h2 className="h-disp" style={{ fontSize: 22, margin: "0 0 6px" }}>What do you sell?</h2>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", margin: "0 0 22px" }}>TRND only recommends promoting things you actually offer.</p>
            {serviceRows}
          </section>
        )}

        {mode === "steps" && step === 4 && (
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
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (mode === "review") {
                setMode("steps");
                setStep(0);
              } else {
                setStep((s) => Math.max(0, s - 1));
              }
            }}
            style={{ visibility: mode === "steps" && step === 0 ? "hidden" : "visible" }}
          >
            ← Back
          </button>
          {mode === "review" ? (
            <button type="submit" className="btn btn-primary" disabled={!canFinish || pending}>
              {pending ? "Finishing setup…" : "Looks right — finish setup"}
            </button>
          ) : step === 0 ? (
            <button type="button" className="btn btn-primary btn-sm" disabled={!canNext || importing} onClick={continueFromWebsite} aria-busy={importing}>
              {importing ? "Reading your site…" : "Continue →"}
            </button>
          ) : step < STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary btn-sm" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
              Continue →
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Finishing setup…" : "Finish setup"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}