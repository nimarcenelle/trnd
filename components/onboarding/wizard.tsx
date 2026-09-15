"use client";

import { useActionState, useMemo, useRef, useState } from "react";

import { completeOnboardingAction, type OnboardingState } from "@/lib/onboarding/actions";
import { AD_SPEND_BANDS, CATEGORIES, type AdPlatform, type BusinessMarket, type CampaignObjective, type ProductionFormat, type SocialHandles } from "@/lib/db/types";
import { FORMAT_OPTIONS, NOTES_MAX, OBJECTIVE_OPTIONS } from "@/lib/onboarding/context";
import { ACCEPT_ATTR, mimeFor } from "@/lib/documents/parse";
import type { ImportEvent, SiteImport } from "@/lib/import/website";
import { AD_PLATFORM_OPTIONS, ONLINE_CATEGORIES, SPEND_BAND_LABELS } from "@/lib/onboarding/market";
import { MAX_ONBOARDING_DOCS, mergeServices, type OnboardingDocument, type ServiceRow } from "@/lib/onboarding/menu-doc";

const STEPS = ["Website", "Category", "Location", "Services", "Context", "Voice"] as const;
// An online brand has no location to give; that step asks about its ads.
const ONLINE_STEPS = ["Website", "Category", "Ads", "Products", "Context", "Voice"] as const;

/** Rows shown before "show all" — a read menu can run to forty items. */
const ROWS_SHOWN = 8;

interface MenuFile {
  id: string;
  name: string;
  source: "site" | "upload" | "paste";
  status: "reading" | "done" | "failed";
  doc?: OnboardingDocument;
  error?: string;
}

function menuFileSummary(f: MenuFile): string {
  if (f.status === "reading") return "Reading…";
  if (f.status === "failed") return f.error ?? "Couldn't read this one";
  const found = f.doc?.digest.services_found ?? [];
  const priced = found.filter((s) => s.price_cents !== null).length;
  if (found.length === 0) return "No priced items in it — kept with your business";
  return `${found.length} item${found.length === 1 ? "" : "s"}${priced > 0 && priced < found.length ? `, ${priced} priced` : ""}${f.source === "site" ? " · found on your site" : ""}`;
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

/** The same picked and unpicked look the category pills use. */
const pillStyle = (on: boolean): React.CSSProperties =>
  on
    ? { background: "var(--amber)", color: "var(--amber-ink)", borderColor: "var(--amber)", cursor: "pointer", fontWeight: 600 }
    : { cursor: "pointer", background: "var(--bg-1)" };

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
  // The accounts their site links to. Only the heuristic `partial` read
  // carries them (the AI refinement rebuilds the prefill without), so a
  // later event without handles never clears the ones already found.
  const [social, setSocial] = useState<SocialHandles>({});
  // Online brands are the default customer. The site read may say local
  // (a street address and a place people walk into); the owner can flip it.
  const [market, setMarket] = useState<BusinessMarket>("online");
  const [spend, setSpend] = useState("");
  // Nearly every paid social brand runs Meta, so it starts ticked.
  const [platforms, setPlatforms] = useState<AdPlatform[]>(["meta"]);
  const online = market === "online";
  const steps: readonly string[] = online ? ONLINE_STEPS : STEPS;
  // The context a brief needs that the site cannot say. All optional; the
  // first week says what is missing.
  const [objective, setObjective] = useState<CampaignObjective | "">("");
  const [formats, setFormats] = useState<ProductionFormat[]>([]);
  const [priorityService, setPriorityService] = useState("");
  const [recentCreative, setRecentCreative] = useState("");
  const [claimsNotes, setClaimsNotes] = useState("");
  // Ads Manager or Google Ads exports, read like menus and imported as ad
  // history at the finish. Kept apart from the menus so a CSV of results
  // never fills the product rows.
  const [exportFiles, setExportFiles] = useState<MenuFile[]>([]);

  // The menu, handed over directly: for sites whose prices live on an
  // ordering platform (Toast, Square) the crawl can't read, or that never
  // listed them. Read by /api/import/document, folded into the rows, and
  // saved as the business's first document at the finish.
  const [menuHost, setMenuHost] = useState<{ name: string; url: string } | null>(null);
  // Plural: a restaurant's prices are routinely split across a food menu, a
  // drinks menu and a brunch menu. Carolina Coffee Shop keeps a coffee and
  // dessert PDF beside a seasonal brunch PDF; reading one and stopping
  // leaves half the prices behind. Each file is its own row with its own
  // outcome, so one that fails is named rather than lost in a summary.
  const [menuFiles, setMenuFiles] = useState<MenuFile[]>([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [showAllRows, setShowAllRows] = useState(false);
  const docs = [...menuFiles, ...exportFiles].flatMap((f) => (f.doc ? [f.doc] : []));
  const docBusy = menuFiles.some((f) => f.status === "reading");

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
    if (d.social && Object.keys(d.social).length > 0) setSocial(d.social);
    if (d.market) setMarket(d.market);
    setMenuHost(d.menuHost ?? null);
    const chips = d.services.slice(0, 6).map((sv) => (sv.price ? `${sv.name} — $${sv.price}` : sv.name));
    if (d.services.length > 6) chips.push(`+${d.services.length - 6} more`);
    if (d.city) chips.push(`${d.city}${d.region ? `, ${d.region}` : ""}`);
    setFoundChips(chips);
  }

  function finishImport(d: SiteImport, menuFilesRead = 0) {
    const found: string[] = [];
    if (d.services.length > 0) found.push(`${d.services.length} offering${d.services.length === 1 ? "" : "s"}`);
    if (menuFilesRead > 0) found.push(`${menuFilesRead === 1 ? "a menu file" : `${menuFilesRead} menu files`}`);
    if (d.city) found.push("your location");
    if (d.category) found.push("your category");
    if (d.priceBand) found.push("your price range");
    const gotName = Boolean(name.trim() || d.name);
    const unpriced = d.services.length > 0 && !d.services.some((sv) => sv.price);
    // An online brand has products, not a menu to upload.
    const menuAsk = d.market === "online"
      ? d.services.length === 0
        ? " Couldn't read your products. Add your best sellers below."
        : ""
      : d.menuHost
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
    // A second site read starts clean: the last site's accounts aren't these.
    setSocial({});
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
            const found = event.documents ?? [];
            if (found.length > 0) {
              // Their items are already merged into event.data.services.
              setMenuFiles((prev) => [
                ...prev.filter((f) => f.source !== "site"),
                ...found.map((doc, i): MenuFile => ({ id: `site-${i}-${doc.name}`, name: doc.name, source: "site", status: "done", doc })),
              ]);
            }
            sawVerdict = true;
            finishImport(event.data, found.length);
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
    if (step === 2) return online || city.trim().length > 0;
    if (step === 3) return services.some((s) => s.name.trim().length > 0);
    return true;
  }, [step, name, website, category, city, services, online]);

  const canFinish =
    name.trim().length > 0 &&
    category.length > 0 &&
    (online || city.trim().length > 0) &&
    services.some((s) => s.name.trim().length > 0);

  function setService(i: number, patch: Partial<ServiceRow>) {
    setServices((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const fileSeq = useRef(0);

  /** Read one menu — a file or the pasted text — into its own row. */
  async function readOneMenu(id: string, file: File | null, text: string) {
    const data = new FormData();
    if (file) data.set("file", file);
    else data.set("text", text);
    data.set("business_name", name);
    data.set("category", category);
    data.set("city", city);
    data.set("region", region);
    let patch: Partial<MenuFile>;
    try {
      const res = await fetch("/api/import/document", { method: "POST", body: data });
      const body = (await res.json().catch(() => ({}))) as Partial<OnboardingDocument> & { error?: string };
      if (res.ok && body.digest) {
        const doc = body as OnboardingDocument;
        setServices((rows) => mergeServices(rows, doc.digest.services_found));
        patch = { status: "done", doc };
      } else {
        patch = { status: "failed", error: body.error ?? "Couldn't read this one" };
      }
    } catch {
      patch = { status: "failed", error: "Lost the connection — try it again" };
    }
    setMenuFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  /** Read one ad export into its own row: the text is kept for the finish,
   * where it becomes ad history; nothing is merged into the product rows. */
  async function readOneExport(id: string, file: File) {
    const data = new FormData();
    data.set("file", file);
    data.set("business_name", name);
    data.set("category", category);
    let patch: Partial<MenuFile>;
    try {
      const res = await fetch("/api/import/document", { method: "POST", body: data });
      const body = (await res.json().catch(() => ({}))) as Partial<OnboardingDocument> & { error?: string };
      if (res.ok && body.digest) patch = { status: "done", doc: body as OnboardingDocument };
      else patch = { status: "failed", error: body.error ?? "Couldn't read this one" };
    } catch {
      patch = { status: "failed", error: "Lost the connection — try it again" };
    }
    setExportFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function addExportFiles(picked: File[]) {
    const accepted = picked.filter((f) => /\.(csv|tsv|txt|xlsx|xls)$/i.test(f.name)).slice(0, 2);
    if (accepted.length === 0) return;
    const batch = accepted.map((file) => ({ file, id: `ex-${++fileSeq.current}` }));
    setExportFiles((prev) => [...prev, ...batch.map(({ file, id }): MenuFile => ({ id, name: file.name, source: "upload", status: "reading" }))]);
    for (const { file, id } of batch) void readOneExport(id, file);
  }

  function addMenuFiles(picked: File[]) {
    setDocError(null);
    const room = MAX_ONBOARDING_DOCS - menuFiles.filter((f) => f.status !== "failed").length;
    if (room <= 0) {
      setDocError(`That's ${MAX_ONBOARDING_DOCS} menus already — remove one to add another.`);
      return;
    }
    const accepted = picked.filter((f) => mimeFor(f.name));
    const skipped = picked.length - accepted.length;
    const batch = accepted.slice(0, room).map((file) => ({ file, id: `up-${++fileSeq.current}` }));
    const notes: string[] = [];
    if (skipped > 0) notes.push(`${skipped} file${skipped === 1 ? " isn't" : "s aren't"} a menu format we read (PDF, photo, Word, Excel, CSV or text).`);
    if (accepted.length > room) notes.push(`Only the first ${room} were added — ${MAX_ONBOARDING_DOCS} menus at most.`);
    if (notes.length > 0) setDocError(notes.join(" "));
    if (batch.length === 0) return;
    setMenuFiles((prev) => [
      ...prev,
      ...batch.map(({ file, id }): MenuFile => ({ id, name: file.name, source: "upload", status: "reading" })),
    ]);
    // Two at a time: fast for a food + drinks pair, gentle on a folder.
    const queue = [...batch];
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) await readOneMenu(job.id, job.file, "");
    };
    void Promise.all([worker(), worker()]);
  }

  function readPastedMenu() {
    const text = pasteText.trim();
    if (text.length < 20) {
      setDocError("Paste at least a few lines of your menu.");
      return;
    }
    setDocError(null);
    const id = `paste-${++fileSeq.current}`;
    setMenuFiles((prev) => [...prev, { id, name: "Pasted menu", source: "paste", status: "reading" }]);
    setPasteText("");
    setPasteOpen(false);
    void readOneMenu(id, null, text);
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
        placeholder={online ? "e.g. Clean skincare for sensitive skin" : "e.g. Contrast therapy & recovery studio"}
        maxLength={60}
        style={{ ...inputStyle, width: "100%", marginBottom: 12 }}
      />
      <div className="flex flex-wrap gap-2" aria-label="Common kinds of business">
        {(online ? ONLINE_CATEGORIES : CATEGORIES).map((c) => (
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

  const socialLine = (
    [
      ["instagram", "Instagram"],
      ["tiktok", "TikTok"],
      ["facebook", "Facebook"],
    ] as const
  )
    .flatMap(([key, label]) => (social[key] ? [`${label} @${social[key]}`] : []))
    .join(" · ");

  const hiddenRows = showAllRows ? 0 : Math.max(0, services.length - ROWS_SHOWN);
  // Brands sell products; places sell services. Same rows either way.
  const itemLabel = online ? "Product" : "Service";
  const serviceRows = (
    <>
      {(hiddenRows > 0 ? services.slice(0, ROWS_SHOWN) : services).map((row, i) => (
        <div className="grid grid-cols-[1fr_130px_40px] gap-[10px] mb-3" key={i}>
          <input aria-label={`${itemLabel} ${i + 1} name`} type="text" value={row.name} onChange={(e) => setService(i, { name: e.target.value })} placeholder={online ? "e.g. Vitamin C serum" : "e.g. Facial balancing consult"} style={inputStyle} />
          <input aria-label={`${itemLabel} ${i + 1} price`} type="text" value={row.price} onChange={(e) => setService(i, { price: e.target.value })} placeholder="$ price" style={inputStyle} />
          <button type="button" aria-label={`Remove ${itemLabel.toLowerCase()} ${i + 1}`} onClick={() => setServices((r) => r.filter((_, idx) => idx !== i))} disabled={services.length === 1} style={{ background: "none", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", color: "var(--ink-faint)", cursor: "pointer" }}>
            ×
          </button>
        </div>
      ))}
      <div className="flex gap-2 flex-wrap">
        {hiddenRows > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAllRows(true)}>
            Show all {services.length}
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setShowAllRows(true);
            setServices((r) => [...r, { name: "", price: "" }]);
          }}
        >
          + Add another
        </button>
      </div>
    </>
  );

  // Hand over the menu: drop or choose files (several at once), or paste
  // it, each read and folded into the rows above. A nested <form> can't
  // live inside the wizard's form, and the file input carries no name, so
  // none of this submits with it.
  const menuPanel = (
    <div className="menu-hand" aria-label="Your menu">
      <label
        className="menu-drop"
        data-dragging={dragging || undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addMenuFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <input
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          aria-label="Menu or price list files"
          className="sr-only"
          onChange={(e) => {
            addMenuFiles(Array.from(e.currentTarget.files ?? []));
            // So choosing the same file again after removing it still fires.
            e.currentTarget.value = "";
          }}
        />
        <span className="menu-drop__icon" aria-hidden="true">
          ↑
        </span>
        <span className="menu-drop__title">
          {docs.length > 0 ? "Add another menu" : dragging ? "Drop it here" : "Drop your menu here, or choose files"}
        </span>
        <span className="menu-drop__hint">
          {menuHost && docs.length === 0
            ? `Your menu is on ${menuHost.name}, which we can't read — a PDF, a photo of the printed menu, or a screenshot all work.`
            : "PDF, a photo of the printed menu, Word or Excel — food, drinks and specials can be separate files."}
        </span>
      </label>

      {menuFiles.length > 0 && (
        <ul className="menu-files" aria-live="polite">
          {menuFiles.map((f) => (
            <li key={f.id} className="menu-file" data-status={f.status}>
              <span className="menu-file__mark" aria-hidden="true">
                {f.status === "done" ? "✓" : f.status === "failed" ? "!" : ""}
              </span>
              <span className="menu-file__body">
                <span className="menu-file__name">{f.name}</span>
                <span className="menu-file__meta">{menuFileSummary(f)}</span>
              </span>
              {f.status !== "reading" && (
                <button
                  type="button"
                  className="menu-file__remove"
                  aria-label={`Don't keep ${f.name}`}
                  onClick={() => setMenuFiles((prev) => prev.filter((x) => x.id !== f.id))}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {pasteOpen ? (
        <div className="flex flex-col gap-2 mt-3">
          <textarea
            aria-label="Pasted menu"
            rows={5}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"Cappuccino 4.75\nBrown Sugar Oat Latte 6\nBaked goods 3–5 …"}
            className="input"
            autoFocus
          />
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={readPastedMenu} disabled={pasteText.trim().length < 20}>
              Read it
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPasteOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="menu-hand__paste" onClick={() => setPasteOpen(true)}>
          No file? Paste the menu as text
        </button>
      )}
      {docError && <p className="font-mono text-[11px] text-red mt-2 mb-0">{docError}</p>}
      {docs.some((d) => d.digest.services_found.length > 0) && !docBusy && (
        <p className="mono-label text-(--mint-text) mt-2 mb-0">Their items are in the list above — fix anything that&apos;s off.</p>
      )}
    </div>
  );

  const locationFields = (
    <>
      {/* An online brand sells everywhere; it is never asked where it is. */}
      {!online && (
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
      )}
      {/* A brand shipping nationally has no radius; the default is stored. */}
      {!online && (
        <div className="field">
          <label htmlFor="ob-radius">Radius — {radius} miles</label>
          <input id="ob-radius" type="range" min={5} max={60} step={5} value={radius} onChange={(e) => setRadius(Number(e.target.value))} style={{ accentColor: "var(--amber)", padding: 0, background: "transparent", border: "none" }} />
        </div>
      )}
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

  // Two plain answers rather than a switch, so the owner can see at a glance
  // which one fits even when the site read guessed wrong.
  const marketToggle = (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How you sell">
      {(
        [
          ["online", "Online DTC brand"],
          ["local", "Local business"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={market === value}
          onClick={() => setMarket(value)}
          className="pill"
          style={pillStyle(market === value)}
        >
          {label}
        </button>
      ))}
    </div>
  );

  // Asked of online brands only: spend sizes the read, platforms say where
  // the creative has to run.
  const namedServices = services.map((r) => r.name.trim()).filter(Boolean);
  const contextFields = (
    <>
      <div className="field">
        <label htmlFor="ob-objective">What your campaigns optimize for</label>
        <select id="ob-objective" value={objective} onChange={(e) => setObjective(e.target.value as CampaignObjective | "")}>
          <option value="">Pick one</option>
          {OBJECTIVE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {objective && <p className="text-[12px] text-ink-faint mx-0 mt-[6px] mb-0">{OBJECTIVE_OPTIONS.find((o) => o.value === objective)?.hint}</p>}
      </div>
      {namedServices.length > 1 && (
        <div className="field">
          <label htmlFor="ob-priority">{online ? "Product" : "Service"} to lead with (optional)</label>
          <select id="ob-priority" value={priorityService} onChange={(e) => setPriorityService(e.target.value)}>
            <option value="">Let each brief choose</option>
            {namedServices.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label>What you can produce</label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="What you can produce">
          {FORMAT_OPTIONS.map((f) => {
            const on = formats.includes(f.value);
            return (
              <button
                key={f.value}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => setFormats((prev) => (on ? prev.filter((x) => x !== f.value) : [...prev, f.value]))}
                className="pill"
                style={pillStyle(on)}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <p className="text-[12px] text-ink-faint mx-0 mt-[6px] mb-0">Briefs are written for what you can actually make.</p>
      </div>
      <div className="field">
        <label htmlFor="ob-recent">What you shot recently (optional)</label>
        <textarea id="ob-recent" rows={2} maxLength={NOTES_MAX} value={recentCreative} onChange={(e) => setRecentCreative(e.target.value)} placeholder="e.g. Three founder talking-heads on the serum, one unboxing. Links are fine." />
        <p className="text-[12px] text-ink-faint mx-0 mt-[6px] mb-0">So each brief can say how it differs from what you ran last.</p>
      </div>
      <div className="field">
        <label htmlFor="ob-claims">What you may and may not claim (optional)</label>
        <textarea id="ob-claims" rows={2} maxLength={NOTES_MAX} value={claimsNotes} onChange={(e) => setClaimsNotes(e.target.value)} placeholder='e.g. Never say "cures". No before-and-after photos.' />
      </div>
      <div className="field">
        <label>Your recent ad results (optional)</label>
        <label className="menu-drop" style={{ padding: "16px 18px" }}>
          <input
            type="file"
            multiple
            accept=".csv,.tsv,.txt,.xlsx,.xls"
            aria-label="Ads Manager export"
            className="sr-only"
            onChange={(e) => {
              addExportFiles(Array.from(e.currentTarget.files ?? []));
              e.currentTarget.value = "";
            }}
          />
          <span className="menu-drop__title">{exportFiles.length > 0 ? "Add another export" : "Upload an Ads Manager or Google Ads export"}</span>
          <span className="menu-drop__hint">
            CSV or Excel, at the ad level. It stops TRND repeating ideas that already failed and lets each brief compare against your
            real baseline. A results export carries numbers and ad names, not the creative itself; the brief reads what is there.
          </span>
        </label>
        {exportFiles.length > 0 && (
          <ul className="menu-files" aria-live="polite">
            {exportFiles.map((f) => (
              <li key={f.id} className="menu-file" data-status={f.status}>
                <span className="menu-file__mark" aria-hidden="true">
                  {f.status === "done" ? "✓" : f.status === "failed" ? "!" : ""}
                </span>
                <span className="menu-file__body">
                  <span className="menu-file__name">{f.name}</span>
                  <span className="menu-file__meta">{f.status === "reading" ? "Reading…" : f.status === "failed" ? (f.error ?? "Couldn't read this one") : "Read. Imported as your ad history at the finish."}</span>
                </span>
                {f.status !== "reading" && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExportFiles((prev) => prev.filter((x) => x.id !== f.id))}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );

  const adFields = (
    <>
      <div className="field">
        <label htmlFor="ob-spend">Monthly paid social spend</label>
        <select id="ob-spend" value={spend} onChange={(e) => setSpend(e.target.value)}>
          <option value="">Pick one</option>
          {AD_SPEND_BANDS.map((band) => (
            <option key={band} value={band}>
              {SPEND_BAND_LABELS[band]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Where you run ads</label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Where you run ads">
          {AD_PLATFORM_OPTIONS.map((p) => {
            const on = platforms.includes(p.value);
            return (
              <button
                key={p.value}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() =>
                  setPlatforms((prev) => (on ? prev.filter((x) => x !== p.value) : [...prev, p.value]))
                }
                className="pill"
                style={pillStyle(on)}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );

  return (
    <div className="card-lg max-w-[620px] w-full py-[36px] px-[34px]">
      {/* progress rail */}
      <div className="flex gap-[6px] mb-[30px]">
        {(mode === "review" ? ["Website", "Confirm"] : steps).map((label, i, arr) => {
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
                style={{ fontSize: 10.5, marginTop: 7, display: "block", color: done ? "var(--amber-text)" : undefined, textAlign: mode === "review" && isLast ? "right" : undefined }}
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
        <input type="hidden" name="social_handles" value={JSON.stringify(social)} />
        <input type="hidden" name="market" value={market} />
        {/* Asked only of online brands, so a local business saves none. */}
        {online && <input type="hidden" name="monthly_ad_spend" value={spend} />}
        {online && platforms.map((p) => <input key={p} type="hidden" name="ad_platforms" value={p} />)}
        <input type="hidden" name="documents" value={docs.length > 0 ? JSON.stringify(docs) : ""} />
        <input type="hidden" name="campaign_objective" value={objective} />
        {formats.map((f) => (
          <input key={f} type="hidden" name="production_formats" value={f} />
        ))}
        <input type="hidden" name="priority_service" value={priorityService} />
        <input type="hidden" name="recent_creative_notes" value={recentCreative} />
        <input type="hidden" name="claims_notes" value={claimsNotes} />

        {mode === "steps" && step === 0 && (
          <section>
            <h2 className="h-disp text-[22px] mx-0 mt-0 mb-[6px]">Start with your website.</h2>
            <p className="text-[14px] text-ink-soft mx-0 mt-0 mb-[22px]">
              TRND reads your products, prices, and social accounts from it. You confirm one screen instead of filling in a questionnaire.
            </p>
            <div className="field">
              <label htmlFor="ob-web">Website</label>
              <input id="ob-web" type="text" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourbrand.com" autoFocus inputMode="url" autoComplete="url" />
            </div>
            <div className="field">
              <label htmlFor="ob-name">Business name</label>
              <input id="ob-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your brand" autoComplete="organization" />
            </div>
            <p className="text-[12px] text-ink-faint mx-0 mt-[2px] mb-0 leading-[1.5]">
              No website? Leave it blank and fill everything in by hand.
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
              <label>How you sell</label>
              {marketToggle}
            </div>
            <div className="field">
              <label htmlFor="ob-name-r">Business name</label>
              <input id="ob-name-r" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your brand" autoComplete="organization" />
              {socialLine && (
                <p className="text-[12px] text-ink-faint mx-0 mt-[6px] mb-0 leading-[1.5]">{socialLine}</p>
              )}
            </div>
            <div className="field">
              <label>Category</label>
              {categoryPicker}
            </div>
            {online && <div className="mt-[18px]">{adFields}</div>}
            <div className="mt-[18px]">{locationFields}</div>
            <div className="field mb-0">
              <label>What you sell</label>
            </div>
            {serviceRows}
            {!online && menuPanel}
            <div className="mt-[22px] pt-[18px] border-t border-line">
              <p className="mono-label mb-3">What a brief needs that your site cannot say</p>
              {contextFields}
            </div>
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
            <div className="mb-[18px]">{marketToggle}</div>
            {categoryPicker}
          </section>
        )}

        {mode === "steps" && step === 2 && (
          <section>
            {online ? (
              <>
                <h2 className="h-disp text-[22px] mx-0 mt-0 mb-[6px]">Where do you run ads?</h2>
                <p className="text-[14px] text-ink-soft mx-0 mt-0 mb-[22px]">So TRND reads the platforms you actually buy on.</p>
                {adFields}
                <div className="mt-[18px]">{locationFields}</div>
              </>
            ) : (
              <>
                <h2 className="h-disp text-[22px] mx-0 mt-0 mb-[6px]">Where do customers find you?</h2>
                <p className="text-[14px] text-ink-soft mx-0 mt-0 mb-[22px]">Signal gets read for your area, not the whole internet.</p>
                {locationFields}
              </>
            )}
          </section>
        )}

        {mode === "steps" && step === 3 && (
          <section>
            <h2 className="h-disp text-[22px] mx-0 mt-0 mb-[6px]">What do you sell?</h2>
            <p className="text-[14px] text-ink-soft mx-0 mt-0 mb-[22px]">TRND only recommends promoting things you actually offer.</p>
            {serviceRows}
            {!online && menuPanel}
          </section>
        )}

        {mode === "steps" && step === 4 && (
          <section>
            <h2 className="h-disp text-[22px] mx-0 mt-0 mb-[6px]">What should a brief know?</h2>
            <p className="text-[14px] text-ink-soft mx-0 mt-0 mb-[22px]">
              What the campaign buys, what you can make, and what you have run. Everything here is optional; the first week says what
              is missing.
            </p>
            {contextFields}
          </section>
        )}

        {mode === "steps" && step === 5 && (
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
          ) : step < steps.length - 1 ? (
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