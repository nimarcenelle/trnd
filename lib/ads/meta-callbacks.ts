import { createHmac, timingSafeEqual } from "node:crypto";

import type { Repo } from "@/lib/db/repo";
import { env } from "@/lib/env";

/**
 * The two callbacks Meta sends about a person, not an ad account.
 *
 * Deauthorize: they removed TRND from their Facebook settings. The token is
 * dead from that moment; the row is marked revoked so Settings says so and
 * the daily sync stops asking.
 *
 * Data deletion: they asked Meta to have their data deleted from the app.
 * The connection goes, and with it every ad-history row the connection
 * synced. An export they uploaded themselves is theirs and stays. Meta
 * expects a confirmation code and a URL where the person can check on it;
 * both are here, and the status URL needs no table because the code
 * carries what it confirms, signed.
 *
 * Both requests arrive as a `signed_request`: base64url signature, a dot,
 * base64url JSON, signed HMAC-SHA256 with the app secret.
 */

export interface SignedRequest {
  user_id: string;
  algorithm?: string;
  issued_at?: number;
}

const b64url = {
  encode: (s: string) => Buffer.from(s, "utf8").toString("base64url"),
  decode: (s: string) => Buffer.from(s, "base64url"),
};

function hmac(secret: string, payload: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

function sameBytes(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The payload if the signature is the app secret's, else null. */
export function parseSignedRequest(raw: string | null | undefined, secret: string = env.metaAppSecret): SignedRequest | null {
  if (!raw || !secret) return null;
  const dot = raw.indexOf(".");
  if (dot <= 0) return null;
  const sig = raw.slice(0, dot);
  const encoded = raw.slice(dot + 1);
  let signature: Buffer;
  try {
    signature = b64url.decode(sig);
  } catch {
    return null;
  }
  if (!sameBytes(signature, hmac(secret, encoded))) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(b64url.decode(encoded).toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (p.algorithm !== undefined && String(p.algorithm).toUpperCase() !== "HMAC-SHA256") return null;
  const userId = p.user_id;
  if (typeof userId !== "string" && typeof userId !== "number") return null;
  return {
    user_id: String(userId),
    algorithm: typeof p.algorithm === "string" ? p.algorithm : undefined,
    issued_at: typeof p.issued_at === "number" ? p.issued_at : undefined,
  };
}

/** Test helper and the inverse of parseSignedRequest: what Meta would send. */
export function signRequest(payload: SignedRequest, secret: string): string {
  const encoded = b64url.encode(JSON.stringify({ algorithm: "HMAC-SHA256", ...payload }));
  return `${hmac(secret, encoded).toString("base64url")}.${encoded}`;
}

/* ------------------------------ confirmation ------------------------------ */

export interface DeletionConfirmation {
  userId: string;
  deletedAt: Date;
}

/** `<base64url user.ts>.<sig>`: verifiable later without storing anything. */
export function deletionConfirmationCode(userId: string, deletedAt: Date, secret: string = env.metaAppSecret): string {
  const body = b64url.encode(`${userId}.${deletedAt.getTime()}`);
  return `${body}.${hmac(secret, body).toString("base64url")}`;
}

export function verifyDeletionConfirmation(code: string | null | undefined, secret: string = env.metaAppSecret): DeletionConfirmation | null {
  if (!code || !secret) return null;
  const dot = code.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = code.slice(0, dot);
  let sig: Buffer;
  try {
    sig = b64url.decode(code.slice(dot + 1));
  } catch {
    return null;
  }
  if (!sameBytes(sig, hmac(secret, body))) return null;
  const text = b64url.decode(body).toString("utf8");
  const at = text.lastIndexOf(".");
  if (at <= 0) return null;
  const ts = Number(text.slice(at + 1));
  if (!Number.isFinite(ts)) return null;
  return { userId: text.slice(0, at), deletedAt: new Date(ts) };
}

export function deletionStatusUrl(code: string): string {
  return `${env.appUrl}/api/connect/meta/data-deletion?code=${encodeURIComponent(code)}`;
}

/* -------------------------------- handlers -------------------------------- */

/** Every connection this Meta user authorized is marked revoked. */
export async function deauthorizeMetaUser(repo: Repo, userId: string): Promise<{ revoked: number }> {
  const rows = await repo.listConnectionsByProviderUser("meta", userId);
  let revoked = 0;
  for (const row of rows) {
    if (row.status === "revoked") continue;
    await repo.upsertConnection({
      business_id: row.business_id,
      provider: row.provider,
      status: "revoked",
      account_id: row.account_id,
      account_name: row.account_name,
      provider_user_id: row.provider_user_id,
      // The token is invalid the moment the app is removed; nothing to keep.
      access_token: "",
      refresh_token: null,
      token_expires_at: row.token_expires_at,
      scopes: row.scopes,
    });
    revoked++;
  }
  return { revoked };
}

/**
 * Every connection this Meta user authorized goes, with the ad-history rows
 * it synced. Returns what was removed and the confirmation to hand back.
 */
export async function deleteMetaUserData(
  repo: Repo,
  userId: string,
  now: Date = new Date(),
): Promise<{ connections: number; adHistoryRows: number; confirmationCode: string; statusUrl: string }> {
  const rows = await repo.listConnectionsByProviderUser("meta", userId);
  let adHistoryRows = 0;
  for (const row of rows) {
    adHistoryRows += await repo.deleteAdHistory(row.business_id, { source: "meta_api" });
    await repo.deleteConnection(row.business_id, "meta");
  }
  const confirmationCode = deletionConfirmationCode(userId, now);
  return { connections: rows.length, adHistoryRows, confirmationCode, statusUrl: deletionStatusUrl(confirmationCode) };
}
