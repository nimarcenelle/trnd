/**
 * Demo-mode auth: local accounts with scrypt password hashes and an
 * HMAC-signed session cookie. Active only when Supabase env vars are absent
 * (BLOCKED.md); the interface in lib/auth/session.ts is identical either way.
 */
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { loadStore, saveStore, type DemoUser } from "@/lib/db/demo/store";

export const DEMO_SESSION_COOKIE = "trnd_demo_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

function secretPath() {
  const dir = process.env.TRND_DEMO_DIR ?? path.join(process.cwd(), ".demo-data");
  return { dir, file: path.join(dir, "auth-secret") };
}

let cachedSecret: Buffer | null = null;
function getSecret(): Buffer {
  if (cachedSecret) return cachedSecret;
  const { dir, file } = secretPath();
  try {
    cachedSecret = Buffer.from(readFileSync(file, "utf8"), "hex");
  } catch {
    cachedSecret = randomBytes(32);
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, cachedSecret.toString("hex"));
  }
  return cachedSecret;
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 32).toString("hex");
}

export function demoSignUp(
  email: string,
  password: string,
  fullName: string,
): { user: DemoUser } | { error: string } {
  const store = loadStore();
  const normalized = email.trim().toLowerCase();
  if (store.users.some((u) => u.email === normalized)) {
    return { error: "An account with that email already exists." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  const salt = randomBytes(16).toString("hex");
  const user: DemoUser = {
    id: randomUUID(),
    email: normalized,
    full_name: fullName || null,
    password_hash: hashPassword(password, salt),
    salt,
    created_at: new Date().toISOString(),
  };
  store.users.push(user);
  // Mirror the on_auth_user_created trigger.
  store.profiles.push({
    id: user.id,
    email: normalized,
    full_name: user.full_name,
    created_at: user.created_at,
  });
  saveStore();
  return { user };
}

export function demoSignIn(
  email: string,
  password: string,
): { user: DemoUser } | { error: string } {
  const store = loadStore();
  const user = store.users.find((u) => u.email === email.trim().toLowerCase());
  if (!user) return { error: "No account with that email." };
  const attempt = Buffer.from(hashPassword(password, user.salt), "hex");
  const actual = Buffer.from(user.password_hash, "hex");
  if (attempt.length !== actual.length || !timingSafeEqual(attempt, actual)) {
    return { error: "Wrong password." };
  }
  return { user };
}

export function createSessionToken(userId: string): string {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${exp}`;
  const sig = createHmac("sha256", getSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  const payload = `${userId}.${expStr}`;
  const expected = createHmac("sha256", getSecret()).update(payload).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expStr) < Date.now()) return null;
  const store = loadStore();
  if (!store.users.some((u) => u.id === userId)) return null;
  return userId;
}
