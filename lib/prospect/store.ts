import { isSupabaseConfigured, warnDemoModeOnce } from "@/lib/env";
import { createAdminSupabase } from "@/lib/db/supabase/admin-client";

import type { LeadStatus, ProspectLead } from "./types";

/**
 * Lead persistence. Supabase (service role, RLS-sealed table) when
 * configured; otherwise an in-process map so local demo mode still works —
 * loudly, and gone on restart.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function toRow(l: ProspectLead): Row {
  return {
    place_id: l.placeId,
    name: l.name,
    category: l.category,
    address: l.address,
    city: l.city,
    region: l.region,
    phone: l.phone,
    website: l.website,
    platform: l.platform,
    emails: l.emails,
    best_email: l.bestEmail,
    email_status: l.emailStatus,
    signal: l.signal,
    ad_pixels: l.adPixels,
    status: l.status,
    search_query: l.searchQuery,
    sent_at: l.sentAt,
    updated_at: new Date().toISOString(),
  };
}

function fromRow(r: Row): ProspectLead {
  return {
    placeId: r.place_id,
    name: r.name,
    category: r.category,
    address: r.address,
    city: r.city,
    region: r.region,
    phone: r.phone,
    website: r.website,
    platform: r.platform,
    emails: r.emails ?? [],
    bestEmail: r.best_email,
    emailStatus: r.email_status,
    signal: r.signal ?? "",
    adPixels: r.ad_pixels ?? [],
    status: r.status,
    searchQuery: r.search_query ?? "",
    sentAt: r.sent_at,
    createdAt: r.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Survives HMR in dev; per-instance in serverless (fine — demo mode only).
const memory: Map<string, ProspectLead> = ((globalThis as Record<string, unknown>).__trndProspects ??=
  new Map()) as Map<string, ProspectLead>;

const TABLE = "prospect_leads";

export async function listLeads(): Promise<ProspectLead[]> {
  if (!isSupabaseConfigured) {
    warnDemoModeOnce();
    return [...memory.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const sb = createAdminSupabase();
  const { data, error } = await sb.from(TABLE).select("*").order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error(`prospect list failed: ${error.message}`);
  return (data ?? []).map(fromRow);
}

export async function knownPlaceIds(): Promise<Set<string>> {
  if (!isSupabaseConfigured) return new Set(memory.keys());
  const sb = createAdminSupabase();
  const { data, error } = await sb.from(TABLE).select("place_id").limit(5000);
  if (error) throw new Error(`prospect dedupe read failed: ${error.message}`);
  return new Set((data ?? []).map((r) => r.place_id as string));
}

export async function saveLead(lead: ProspectLead): Promise<void> {
  if (!isSupabaseConfigured) {
    memory.set(lead.placeId, lead);
    return;
  }
  const sb = createAdminSupabase();
  const { error } = await sb.from(TABLE).upsert(toRow(lead), { onConflict: "place_id" });
  if (error) throw new Error(`prospect save failed: ${error.message}`);
}

export async function getLeads(placeIds: string[]): Promise<ProspectLead[]> {
  if (!isSupabaseConfigured) {
    return placeIds.map((id) => memory.get(id)).filter((l): l is ProspectLead => Boolean(l));
  }
  const sb = createAdminSupabase();
  const { data, error } = await sb.from(TABLE).select("*").in("place_id", placeIds);
  if (error) throw new Error(`prospect read failed: ${error.message}`);
  return (data ?? []).map(fromRow);
}

export async function setLeadStatus(placeIds: string[], status: LeadStatus): Promise<void> {
  if (!isSupabaseConfigured) {
    for (const id of placeIds) {
      const lead = memory.get(id);
      if (lead) memory.set(id, { ...lead, status });
    }
    return;
  }
  const sb = createAdminSupabase();
  const { error } = await sb
    .from(TABLE)
    .update({ status, updated_at: new Date().toISOString() })
    .in("place_id", placeIds);
  if (error) throw new Error(`prospect status update failed: ${error.message}`);
}

export async function markSent(placeId: string, subject: string): Promise<void> {
  const sentAt = new Date().toISOString();
  if (!isSupabaseConfigured) {
    const lead = memory.get(placeId);
    if (lead) memory.set(placeId, { ...lead, status: "sent", sentAt });
    return;
  }
  const sb = createAdminSupabase();
  const { error } = await sb
    .from(TABLE)
    .update({ status: "sent", sent_at: sentAt, sent_subject: subject, updated_at: sentAt })
    .eq("place_id", placeId);
  if (error) throw new Error(`prospect mark-sent failed: ${error.message}`);
}
