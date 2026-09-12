"use client";

import { useActionState, useMemo, useRef, useState } from "react";

import { completeOnboardingAction, type OnboardingState } from "@/lib/onboarding/actions";
import { CATEGORIES } from "@/lib/db/types";
import { ACCEPT_ATTR } from "@/lib/documents/parse";
import type { ImportEvent, SiteImport } from "@/lib/import/website";
import { mergeServices, type OnboardingDocument, type ServiceRow } from "@/lib/onboarding/menu-doc";

const STEPS = ["Website", "Category", "Location", "Services", "Voice"] as const;

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

  // The menu, handed over directly: for sites whose prices live on an
  // ordering platform (Toast, Square) the crawl can't read, or that never
  // listed them. Read by /api/import/document, folded into the rows, and
  // saved as the business's first document at the finish.
  const [menuHost, setMenuHost] = useState<{ name: string; url: string } | null>(null);
  // Plural: a restaurant's prices are routinely split across a food menu, a
  // drinks menu and a brunch menu. Carolina Coffee Shop keeps a coffee and
  // dessert PDF beside a seasonal brunch PDF; reading one and stopping
  // leaves half the prices behind.
  const [docs, setDocs] = useState<OnboardingDocument[]>([]);
  const [docMode, setDocMode] = useState<"file" | "paste">("file");
  const [docBusy, setDocBusy] = useState(false);
  const [docNote, setDocNote] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");

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
    setMenuHost(d.menuHost ?? null);
    const chips = d.services.slice(0, 6).map((sv) => (sv.price ? `${sv.name} — $${sv.price}` : sv.name));
    if (d.services.length > 6) chips.push(`+${d.services.length - 6} more`);
    if (d.city) chips.push(`${d.city}${d.region ? `, ${d.region}` : ""}`);
    setFoundChips(chips);
  }

  function finishImport(d: SiteImport) {
    const found: string[] = [];
    if (d.services.length > 0) found.push(`${d.services.length} offering${d.services.length === 1 ? "" : "s"}`);
    if (d.city) found.push("your location");
    if (d.category) found.push("your category");
    if (d.priceBand) found.push("your price range");
    const gotName = Boolean(name.trim() || d.name);
    const unpriced = d.services.length > 0 && !d.services.some((sv) => sv.price);
    const menuAsk = d.menuHost
      ? ` Your menu is on ${d.menuHost.name}, which doesn't let us read it — upload the menu or paste it below and the prices fill in.`
      : d.services.length === 0
        ? " Couldn't read a menu or price list — upload one or paste it below, or add what you sell by hand."
        : unpriced
          ? " No prices were listed on the site — upload your menu or paste it below and they fill in."
          : "";
    setImportNote(
      (found.length > 0
        ? `Read your site — found ${found.join(", ")}. Confirm or edit below, then you're in.`
        : "Read your site — confirm the details below.") +
        menuAsk +
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

  async function readMenu(files: File[] | null) {
    const list = files ?? [];
    if (list.length === 0 && pasteText.trim().length < 20) {
      setDocError("Paste at least a few lines of your menu.");
      return;
    }
    setDocBusy(true);
    setDocError(null);
    setDocNote(null);

    // One request per file, in order, so a menu that fails to parse does not
    // take the others down with it and the rows merge as each lands.
    const jobs: (File | null)[] = list.length > 0 ? list : [null];
    const read: OnboardingDocument[] = [];
    const failed: string[] = [];
    let items = 0;
    let priced = 0;

    for (const file of jobs) {
      const data = new FormData();
      if (file) data.set("file", file);
      else data.set("text", pasteText.trim());
      data.set("business_name", name);
      data.set("category", category);
      data.set("city", city);
      data.set("region", region);
      try {
        const res = await fetch("/api/import/document", { method: "POST", body: data });
        const body = (await res.json().catch(() => ({}))) as Partial<OnboardingDocument> & { error?: string };
        if (!res.ok || !body.digest) {
          failed.push(file?.name ?? "your pasted text");
          continue;
        }
        const doc = body as OnboardingDocument;
        const found = doc.digest.services_found;
        read.push(doc);
        items += found.length;
        priced += found.filter((f) => f.price_cents !== null).length;
        setServices((rows) => mergeServices(rows, found));
      } catch {
        failed.push(file?.name ?? "your pasted text");
      }
    }

    setDocs((prev) => [...prev, ...read]);
    if (read.length === 0) {
      setDocError("None of those could be read — try a PDF, Word, Excel, or paste the text.");
    } else {
      const names = read.map((d) => d.name).join(", ");
      setDocNote(
        items > 0
          ? `Read ${names} — ${items} item${items === 1 ? "" : "s"}${priced > 0 ? `, ${priced} with prices` : ""}. They're in the list below; fix anything that's off.` +
              (failed.length > 0 ? ` Couldn't read ${failed.join(", ")}.` : "")
          : `Read ${names}, but no items with prices were in ${read.length === 1 ? "it" : "them"} — kept with your business, and you can add what you sell below.`,
      );
      setPasteText("");
    }
    setDocBusy(false);
  }

  // Free text — the business's identity in the customer's words. The stock
  // verticals are one-tap starting points, not the only allowed answers.
  const categoryPicker = (
    <div>
      <input
        aria-label="What your business is"
        type="text"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder="e.g. Contrast therapy & recovery studio"
        maxLength={60}
        style={{ ...inputStyle, width: "100%", marginBottom: 12 }}
      />
      <div className="flex flex-wrap gap-2" aria-label="Common kinds of business">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
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
      <p className="mx-0 mt-[10px] mb-0 text-[12px] text-ink-faint">
        Say what customers would call you — specific beats broad. It shapes every recommendation.
      </p>
    </div>
  );

  const serviceRows = (
    <>
      {services.map((row, i) => (
        <div className="grid grid-cols-[1fr_130px_40px] gap-[10px] mb-3" key={i}>
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

  // Hand over the menu: a file or pasted text, read and folded into the
  // rows above. A nested <form> can't live inside the wizard's form, so
  // the controls submit through readMenu directly.
  const menuPanel = (
    <div className="mt-[18px] p-[14px] rounded-(--radius-sm) border border-dashed border-line-strong bg-(--bg-1)" aria-label="Upload your menu">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-[10px]">
        <div>
          <div className="text-[13.5px] font-semibold">Have a menu or price list?</div>
          <div className="text-[12px] text-ink-faint leading-[1.5]">
            {menuHost
              ? `Your menu is on ${menuHost.name}, which we can't read. Upload it or paste it and the prices fill in.`
              : "Upload it or paste it — the items and prices fill in above, and it stays with your business."}
          </div>
        </div>
        <div className="flex gap-2">
          {(["file", "paste"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className="pill"
              aria-pressed={docMode === m}
              onClick={() => setDocMode(m)}
              style={{ cursor: "pointer", background: docMode === m ? "var(--amber-soft)" : "var(--bg-2)", color: docMode === m ? "var(--amber-text)" : undefined }}
            >
              {m === "file" ? "Upload a file" : "Paste text"}
            </button>
          ))}
        </div>
      </div>
      {docMode === "file" ? (
        <input
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          aria-label="Menu or price list files"
          className="input py-[9px] px-3 w-full"
          disabled={docBusy}
          onChange={(e) => {
            const picked = Array.from(e.currentTarget.files ?? []);
            if (picked.length > 0) void readMenu(picked);
          }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            aria-label="Pasted menu"
            rows={5}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"Cappuccino 4.75\nBrown Sugar Oat Latte 6\nBaked goods 3–5 …"}
            className="input"
            disabled={docBusy}
          />
          <div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void readMenu(null)} disabled={docBusy || pasteText.trim().length < 20} aria-busy={docBusy}>
              {docBusy ? "Reading…" : "Read it"}
            </button>
          </div>
        </div>
      )}
      <div className="mt-2 min-h-[16px]" aria-live="polite">
        {docBusy && docMode === "file" && <span className="mono-label">Reading your menu…</span>}
        {docNote && <span className="mono-label text-(--mint-text)">{docNote}</span>}
        {docError && <span className="font-mono text-[11px] text-red">{docError}</span>}
      </div>
    </div>
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
    <div className="card-lg max-w-[620px] w-full py-[36px] px-[34px]">
      {/* progress rail */}
      <div className="flex gap-[6px] mb-[30px]">
        {(mode === "review" ? (["Website", "Confirm"] as const) : STEPS).map((label, i, arr) => {
          const done = mode === "review" || i <= step;
          const isLast = i === arr.length - 1;
          return (
            <div className="flex-1" key={label}>
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
                style={{ fontSize: 9.5, marginTop: 6, display: "block", color: done ? "var(--amber-text)" : undefined, textAlign: mode === "review" && isLast ? "right" : undefined }}
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
        <input type="hidden" name="documents" value={docs.length > 0 ? JSON.stringify(docs) : ""} />

        {mode === "steps" && step === 0 && (
          <section>
            <h2 className="h-disp text-[22px] mx-0 mt-0 mb-[6px]">Start with your website.</h2>
            <p className="text-[14px] text-ink-soft mx-0 mt-0 mb-[22px]">
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
            <p className="text-[12px] text-ink-faint mx-0 mt-[2px] mb-0 leading-[1.5]">
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
            <h2 className="h-disp text-[22px] mx-0 mt-0 mb-[6px]">Confirm what we read.</h2>
            <p className="text-[14px] text-ink-soft mx-0 mt-0 mb-[22px]">
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
            <div className="mt-[18px]">{locationFields}</div>
            <div className="field mb-0">
              <label>What you sell</label>
            </div>
            {serviceRows}
            {menuPanel}
            <div className="field mt-[18px]">
              <label htmlFor="ob-voice-r">Brand voice notes (optional)</label>
              <textarea id="ob-voice-r" rows={3} value={voice} onChange={(e) => setVoice(e.target.value)} placeholder='e.g. "Warm but direct. We never discount, we add value. No exclamation marks."' />
            </div>
          </section>
        )}

        {mode === "steps" && step === 1 && (
          <section>
            <h2 className="h-disp text-[22px] mx-0 mt-0 mb-[6px]">What kind of business?</h2>
            <p className="text-[14px] text-ink-soft mx-0 mt-0 mb-[22px]">This decides which demand signals TRND watches for you.</p>
            {categoryPicker}
          </section>
        )}

        {mode === "steps" && step === 2 && (
          <section>
            <h2 className="h-disp text-[22px] mx-0 mt-0 mb-[6px]">Where do customers find you?</h2>
            <p className="text-[14px] text-ink-soft mx-0 mt-0 mb-[22px]">Signal gets read for your area, not the whole internet.</p>
            {locationFields}
          </section>
        )}

        {mode === "steps" && step === 3 && (
          <section>
            <h2 className="h-disp text-[22px] mx-0 mt-0 mb-[6px]">What do you sell?</h2>
            <p className="text-[14px] text-ink-soft mx-0 mt-0 mb-[22px]">TRND only recommends promoting things you actually offer.</p>
            {serviceRows}
            {menuPanel}
          </section>
        )}

        {mode === "steps" && step === 4 && (
          <section>
            <h2 className="h-disp text-[22px] mx-0 mt-0 mb-[6px]">How do you sound?</h2>
            <p className="text-[14px] text-ink-soft mx-0 mt-0 mb-[22px]">
              Optional — a sentence or two so generated copy sounds like you, not like everyone else.
            </p>
            <div className="field">
              <label htmlFor="ob-voice">Brand voice notes</label>
              <textarea id="ob-voice" rows={4} value={voice} onChange={(e) => setVoice(e.target.value)} placeholder='e.g. "Warm but direct. We never discount, we add value. No exclamation marks."' />
            </div>
          </section>
        )}

        {state.error && <p className="form-error">{state.error}</p>}

        <div className="flex justify-between mt-7">
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
            Back
          </button>
          {mode === "review" ? (
            <button type="submit" className="btn btn-primary" disabled={!canFinish || pending}>
              {pending ? "Finishing setup…" : "Looks right — finish setup"}
            </button>
          ) : step === 0 ? (
            <button type="button" className="btn btn-primary btn-sm" disabled={!canNext || importing} onClick={continueFromWebsite} aria-busy={importing}>
              {importing ? "Reading your site…" : "Continue"}
            </button>
          ) : step < STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary btn-sm" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
              Continue
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