"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { DEFAULT_BODY, DEFAULT_SUBJECT, renderTemplate } from "@/lib/prospect/template";
import type { ProspectLead, RunEvent } from "@/lib/prospect/types";

/**
 * The prospector console — discovery pipeline on the left, live leads table
 * on the right, outreach composer underneath. Streams /api/admin/prospector/run
 * (NDJSON) and manages the queue through /api/admin/prospector/outreach.
 */

// ---------- design tokens (from the prospector mockup) ----------
const T = {
  bg: "#0E1114",
  panel: "#151A1F",
  panelSoft: "#1B222A",
  line: "#242C35",
  text: "#E7E3DA",
  dim: "#8B94A0",
  faint: "#5A6470",
  amber: "#F2A93B",
  amberSoft: "rgba(242,169,59,0.12)",
  green: "#3ECF8E",
  greenSoft: "rgba(62,207,142,0.12)",
  red: "#E5654E",
  redSoft: "rgba(229,101,78,0.12)",
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  sans: "'Inter', system-ui, sans-serif",
};

const STAGES = ["Discover", "Crawl", "Verify", "Ready"] as const;
const STAGE_SUBS = ["places found", "sites crawled", "emails checked", "leads ready"] as const;

const EMAIL_META: Record<ProspectLead["emailStatus"], { label: string; color: string; bgc: string }> = {
  verified: { label: "VERIFIED", color: T.green, bgc: T.greenSoft },
  risky: { label: "RISKY", color: T.amber, bgc: T.amberSoft },
  none: { label: "NO EMAIL", color: T.faint, bgc: "rgba(90,100,112,0.15)" },
};

const STATUS_META: Record<ProspectLead["status"], { label: string; color: string; bgc: string }> = {
  new: { label: "NEW", color: T.dim, bgc: "rgba(139,148,160,0.12)" },
  queued: { label: "QUEUED", color: T.amber, bgc: T.amberSoft },
  sent: { label: "SENT", color: T.green, bgc: T.greenSoft },
  opted_out: { label: "OPTED OUT", color: T.red, bgc: T.redSoft },
  skipped: { label: "SKIPPED", color: T.faint, bgc: "rgba(90,100,112,0.15)" },
};

const selectable = (l: ProspectLead) =>
  Boolean(l.bestEmail) && (l.status === "new" || l.status === "queued");

function toCsv(leads: ProspectLead[]): string {
  const cols = ["name", "category", "address", "city", "region", "phone", "website", "platform", "bestEmail", "emailStatus", "signal", "status"] as const;
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...leads.map((l) => cols.map((c) => esc(l[c])).join(","))].join("\n");
}

export function ProspectorClient() {
  const [location, setLocation] = useState("Twentynine Palms, CA");
  const [radius, setRadius] = useState(25);
  const [category, setCategory] = useState("coffee shops, restaurants, fitness studios");
  const [cap, setCap] = useState(50);
  const [onlyNoAds, setOnlyNoAds] = useState(true);

  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [counts, setCounts] = useState({ discovered: 0, crawled: 0, verified: 0, ready: 0 });
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [leads, setLeads] = useState<ProspectLead[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((msg: string, bad = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, bad });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // Saved leads land under any freshly streamed rows.
  useEffect(() => {
    fetch("/api/admin/prospector/leads")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { leads: ProspectLead[] }) => {
        setLeads((prev) => {
          const have = new Set(prev.map((l) => l.placeId));
          return [...prev, ...data.leads.filter((l) => !have.has(l.placeId))];
        });
      })
      .catch(() => flash("Couldn't load saved leads", true));
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [flash]);

  const applyEvent = useCallback((event: RunEvent) => {
    if (event.type === "counts") {
      setCounts({ discovered: event.discovered, crawled: event.crawled, verified: event.verified, ready: event.ready });
    } else if (event.type === "status") {
      setStatusLine(event.label);
    } else if (event.type === "lead") {
      setLeads((prev) => [event.lead, ...prev.filter((l) => l.placeId !== event.lead.placeId)]);
    } else if (event.type === "done") {
      setStatusLine(
        `${event.ready} new lead${event.ready === 1 ? "" : "s"}` +
          (event.skippedKnown > 0 ? ` · ${event.skippedKnown} already known` : "") +
          (event.filteredAds > 0 ? ` · ${event.filteredAds} filtered (ads running)` : ""),
      );
    } else if (event.type === "error") {
      setStatusLine(null);
      throw new Error(event.reason);
    }
  }, []);

  const run = async () => {
    if (running) return;
    setRunning(true);
    setDone(false);
    setCounts({ discovered: 0, crawled: 0, verified: 0, ready: 0 });
    setStatusLine("Starting…");
    try {
      const res = await fetch("/api/admin/prospector/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          location,
          radiusMiles: radius,
          categories: category.split(",").map((c) => c.trim()).filter(Boolean),
          cap,
          onlyNoAds,
        }),
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => null)) as { reason?: string } | null;
        throw new Error(err?.reason ?? `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done: eof, value } = await reader.read();
        if (eof) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) applyEvent(JSON.parse(line) as RunEvent);
        }
      }
      setDone(true);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Run failed", true);
    } finally {
      setRunning(false);
    }
  };

  const outreachAction = async (action: string, placeIds: string[], extra?: object) => {
    const res = await fetch("/api/admin/prospector/outreach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, placeIds, ...extra }),
    });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) throw new Error(String(data?.error ?? `HTTP ${res.status}`));
    return data;
  };

  const setLocalStatus = (ids: string[], status: ProspectLead["status"]) =>
    setLeads((prev) => prev.map((l) => (ids.includes(l.placeId) ? { ...l, status } : l)));

  const queueSelected = async () => {
    const ids = [...selected];
    if (ids.length === 0) return flash("Select leads first");
    try {
      await outreachAction("queue", ids);
      setLocalStatus(ids, "queued");
      setSelected(new Set());
      flash(`${ids.length} lead${ids.length === 1 ? "" : "s"} queued for outreach`);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Queue failed", true);
    }
  };

  const optOutSelected = async () => {
    const ids = [...selected];
    if (ids.length === 0) return flash("Select leads first");
    try {
      await outreachAction("opt_out", ids);
      setLocalStatus(ids, "opted_out");
      setSelected(new Set());
      flash(`${ids.length} marked opted out — never emailed again`);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Update failed", true);
    }
  };

  const queued = leads.filter((l) => l.status === "queued");

  const sendQueued = async () => {
    if (sending || queued.length === 0) return;
    const batch = queued.slice(0, 25);
    const ok = window.confirm(
      `Send ${batch.length} outreach email${batch.length === 1 ? "" : "s"} now, from your real sender?\n\nFirst recipient: ${batch[0].bestEmail}`,
    );
    if (!ok) return;
    setSending(true);
    try {
      const data = await outreachAction("send", batch.map((l) => l.placeId), { subject, body });
      const sent = (data?.sent ?? []) as { placeId: string }[];
      const skipped = (data?.skipped ?? []) as { reason: string }[];
      setLocalStatus(sent.map((s) => s.placeId), "sent");
      flash(`Sent ${sent.length}` + (skipped.length > 0 ? ` · ${skipped.length} skipped` : ""));
    } catch (err) {
      flash(err instanceof Error ? err.message : "Send failed", true);
    } finally {
      setSending(false);
    }
  };

  const exportCsv = () => {
    const blob = new Blob([toCsv(leads)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "trnd-leads.csv";
    a.click();
    URL.revokeObjectURL(a.href);
    flash("Exported trnd-leads.csv");
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const eligible = leads.filter(selectable).map((l) => l.placeId);
  const toggleAll = () =>
    setSelected((s) => (s.size === eligible.length ? new Set() : new Set(eligible)));

  const countValues = [counts.discovered, counts.crawled, counts.verified, counts.ready];
  const stageIdx = !running ? -1 : counts.ready > 0 ? 3 : counts.verified > 0 ? 2 : counts.crawled > 0 ? 1 : 0;
  const nSel = selected.size;
  const nVerified = leads.filter((l) => l.emailStatus === "verified").length;
  const previewLead = queued[0] ?? leads.find(selectable) ?? null;

  return (
    <div style={{ background: T.bg, color: T.text, fontFamily: T.sans, minHeight: "100vh" }} className="w-full">
      <style>{`
        .pros input:focus, .pros select:focus, .pros textarea:focus, .pros button:focus-visible { outline: 2px solid ${T.amber}; outline-offset: 1px; }
        @media (prefers-reduced-motion: reduce) { .pros * { transition: none !important; animation: none !important; } }
        @keyframes prosRowIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        .pros .rowIn { animation: prosRowIn 240ms ease both; }
        @keyframes prosPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        .pros .pulsing { animation: prosPulse 1.1s ease-in-out infinite; }
      `}</style>

      <div className="pros">
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="flex items-baseline gap-3">
            <span style={{ fontWeight: 700, fontSize: 20, letterSpacing: "0.06em" }}>TRND</span>
            <span style={{ color: T.dim, fontFamily: T.mono, fontSize: 12 }}>/ prospector</span>
            <span style={{ background: T.amberSoft, color: T.amber, fontFamily: T.mono, fontSize: 10, padding: "2px 8px", borderRadius: 3, letterSpacing: "0.08em" }}>INTERNAL</span>
          </div>
          <div style={{ fontFamily: T.mono, fontSize: 11, color: T.faint }}>
            {statusLine ?? `${leads.length} leads on file`}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row">
          {/* search panel */}
          <div className="p-5 lg:w-72 shrink-0 flex flex-col gap-4" style={{ borderRight: `1px solid ${T.line}` }}>
            <Field label="Location">
              <input value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Radius">
              <select value={radius} onChange={(e) => setRadius(+e.target.value)} style={inputStyle}>
                {[10, 25, 50, 100].map((r) => (
                  <option key={r} value={r}>{r} mi</option>
                ))}
              </select>
            </Field>
            <Field label="Business types">
              <input value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle} />
              <p style={{ fontSize: 11, color: T.faint, marginTop: 6 }}>Comma-separated. Each becomes a Places search.</p>
            </Field>
            <Field label={`Lead cap — ${cap}`}>
              <input type="range" min="10" max="200" step="10" value={cap} onChange={(e) => setCap(+e.target.value)} style={{ width: "100%", accentColor: T.amber }} />
            </Field>
            <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 13, color: T.dim }}>
              <input type="checkbox" checked={onlyNoAds} onChange={(e) => setOnlyNoAds(e.target.checked)} style={{ accentColor: T.amber }} />
              Only businesses with no ad pixel
            </label>
            <button onClick={run} disabled={running}
              style={{ background: running ? T.panelSoft : T.amber, color: running ? T.dim : "#141414", fontWeight: 600, fontSize: 14, padding: "10px 0", borderRadius: 6, border: "none", cursor: running ? "default" : "pointer", letterSpacing: "0.02em" }}>
              {running ? "Running…" : done ? "Run again" : "Run discovery"}
            </button>
            <p style={{ fontSize: 11, color: T.faint, lineHeight: 1.5 }}>
              Places search → site crawl for emails + ad pixels → DNS verify → dedupe against the leads table.
            </p>
          </div>

          {/* main */}
          <div className="flex-1 p-5 min-w-0">
            {/* pipeline */}
            <div className="flex items-stretch gap-2 mb-5">
              {STAGES.map((s, i) => {
                const active = i === stageIdx && running;
                const passed = i < stageIdx || done;
                return (
                  <div key={s} className="flex-1 px-3 py-2 rounded"
                    style={{ background: active ? T.amberSoft : T.panel, border: `1px solid ${active ? T.amber : T.line}`, opacity: stageIdx >= i || done || !running ? 1 : 0.45 }}>
                    <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: "0.1em", color: active ? T.amber : T.dim }} className={active ? "pulsing" : ""}>
                      {s.toUpperCase()}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 600, color: active ? T.amber : passed ? T.text : T.faint }}>
                      {countValues[i]}
                    </div>
                    <div style={{ fontSize: 10, color: T.faint }}>{STAGE_SUBS[i]}</div>
                  </div>
                );
              })}
            </div>

            {/* table */}
            <div className="rounded overflow-x-auto" style={{ border: `1px solid ${T.line}` }}>
              <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
                <thead>
                  <tr style={{ background: T.panel, color: T.dim, fontFamily: T.mono, fontSize: 10, letterSpacing: "0.08em" }}>
                    <th style={thStyle}>
                      <input type="checkbox" onChange={toggleAll} checked={nSel > 0 && nSel === eligible.length} style={{ accentColor: T.amber }} aria-label="Select all" />
                    </th>
                    <th style={thStyle}>BUSINESS</th>
                    <th style={thStyle}>LOCATION</th>
                    <th style={thStyle}>PLATFORM</th>
                    <th style={thStyle}>EMAIL</th>
                    <th style={thStyle}>VERIFY</th>
                    <th style={thStyle}>SIGNAL</th>
                    <th style={thStyle}>OUTREACH</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: "40px 16px", textAlign: "center", color: T.faint, fontSize: 13 }}>
                        {running ? "Pipeline running — leads land here as verification completes." : "Set your search and run discovery to build a lead list."}
                      </td>
                    </tr>
                  )}
                  {leads.map((l) => {
                    const em = EMAIL_META[l.emailStatus];
                    const sm = STATUS_META[l.status];
                    return (
                      <tr key={l.placeId} className="rowIn" style={{ borderTop: `1px solid ${T.line}`, background: selected.has(l.placeId) ? T.panelSoft : "transparent" }}>
                        <td style={tdStyle}>
                          {selectable(l) ? (
                            <input type="checkbox" checked={selected.has(l.placeId)} onChange={() => toggle(l.placeId)} style={{ accentColor: T.amber }} aria-label={`Select ${l.name}`} />
                          ) : null}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600 }}>{l.name}</div>
                          <div style={{ fontSize: 11, color: T.faint }}>{l.category ?? "—"}</div>
                        </td>
                        <td style={{ ...tdStyle, color: T.dim }}>{l.city ? `${l.city}, ${l.region ?? ""}` : (l.address ?? "—")}</td>
                        <td style={{ ...tdStyle, fontFamily: T.mono, fontSize: 11, color: l.platform === "None" ? T.faint : T.dim }}>{l.platform}</td>
                        <td style={{ ...tdStyle, fontFamily: T.mono, fontSize: 12 }}>{l.bestEmail ?? <span style={{ color: T.faint }}>—</span>}</td>
                        <td style={tdStyle}>
                          <span style={{ background: em.bgc, color: em.color, fontFamily: T.mono, fontSize: 9, letterSpacing: "0.08em", padding: "3px 7px", borderRadius: 3 }}>{em.label}</span>
                        </td>
                        <td style={{ ...tdStyle, fontSize: 11, color: T.dim }}>{l.signal}</td>
                        <td style={tdStyle}>
                          <span style={{ background: sm.bgc, color: sm.color, fontFamily: T.mono, fontSize: 9, letterSpacing: "0.08em", padding: "3px 7px", borderRadius: 3 }}>{sm.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* actions */}
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <span style={{ fontFamily: T.mono, fontSize: 11, color: T.dim }}>
                {leads.length} leads · {nVerified} verified · {nSel} selected · {queued.length} queued
              </span>
              <div className="flex-1" />
              <button onClick={exportCsv} style={ghostBtn} disabled={leads.length === 0}>Export CSV</button>
              <button onClick={optOutSelected} style={{ ...ghostBtn, color: T.red }} disabled={nSel === 0}>Mark opted out</button>
              <button onClick={queueSelected} disabled={nSel === 0}
                style={{ ...ghostBtn, background: nSel > 0 ? T.amber : T.panelSoft, color: nSel > 0 ? "#141414" : T.dim, border: "none", fontWeight: 600 }}>
                Add {nSel || ""} to outreach queue
              </button>
            </div>

            {/* outreach composer */}
            {queued.length > 0 && (
              <div className="mt-6 rounded p-4 flex flex-col gap-3" style={{ border: `1px solid ${T.line}`, background: T.panel }}>
                <div className="flex items-baseline justify-between">
                  <span style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: "0.1em", color: T.dim }}>
                    OUTREACH — {queued.length} QUEUED
                  </span>
                  <span style={{ fontSize: 11, color: T.faint }}>
                    Merge fields: {"{{name}} {{city}} {{category}} {{no_ads_line}}"}
                  </span>
                </div>
                <Field label="Subject">
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Body">
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10}
                    style={{ ...inputStyle, fontFamily: T.mono, fontSize: 12, lineHeight: 1.55, resize: "vertical" }} />
                </Field>
                {previewLead && (
                  <div className="rounded p-3" style={{ background: T.panelSoft, border: `1px solid ${T.line}` }}>
                    <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: "0.1em", color: T.faint, marginBottom: 8 }}>
                      PREVIEW — {previewLead.name} ({previewLead.bestEmail})
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{renderTemplate(subject, previewLead)}</div>
                    <div style={{ fontSize: 12, color: T.dim, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{renderTemplate(body, previewLead)}</div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <p style={{ fontSize: 11, color: T.faint, lineHeight: 1.5, margin: 0 }} className="flex-1">
                    Sends one real email per queued lead (max 25 per run) from OUTREACH_FROM. Keep the opt-out
                    line — and mark anyone who says no as opted out so they&apos;re never emailed again.
                  </p>
                  <button onClick={sendQueued} disabled={sending}
                    style={{ ...ghostBtn, background: sending ? T.panelSoft : T.green, color: sending ? T.dim : "#0B1512", border: "none", fontWeight: 600 }}>
                    {sending ? "Sending…" : `Send to ${Math.min(queued.length, 25)} queued`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {toast && (
          <div style={{ position: "fixed", bottom: 20, right: 20, background: T.panelSoft, border: `1px solid ${toast.bad ? T.red : T.green}`, color: T.text, padding: "10px 16px", borderRadius: 6, fontSize: 13, fontFamily: T.mono, zIndex: 50 }}>
            {toast.bad ? "✕" : "✓"} {toast.msg}
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", background: "#1B222A", border: "1px solid #242C35", color: "#E7E3DA",
  padding: "8px 10px", borderRadius: 5, fontSize: 13, fontFamily: "inherit",
};
const thStyle: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontWeight: 500 };
const tdStyle: React.CSSProperties = { padding: "10px 12px", verticalAlign: "top" };
const ghostBtn: React.CSSProperties = {
  background: "transparent", border: "1px solid #242C35", color: "#E7E3DA",
  padding: "8px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: "0.1em", color: T.dim, marginBottom: 6 }}>
        {label.toUpperCase()}
      </div>
      {children}
    </div>
  );
}
