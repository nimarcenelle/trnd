/**
 * Saved work: the essay draft, odds answers, activity lists and Final Read pieces. Signed in, it lives in the account
 * (encrypted on the server) and follows the student to any device; signed out, it lives in this browser. The first
 * load after signing in carries browser work into an empty account. Keys were "admitted-…" before the rename, so
 * browser reads fall back to them.
 */
export const storeKey = (name: string) => `essayodds-${name}`;

function readLocal(name: string): string | null {
  try {
    return localStorage.getItem(storeKey(name)) ?? localStorage.getItem(`admitted-${name}`);
  } catch {
    return null;
  }
}

function writeLocal(name: string, value: string) {
  try {
    localStorage.setItem(storeKey(name), value);
  } catch {}
}

/** Kept for code that only needs this browser's copy right now. */
export const readStore = readLocal;

let signedIn: boolean | null = null;

/** The saved value: the account's copy when signed in, else this browser's. */
export async function restore(name: string): Promise<string | null> {
  const local = readLocal(name);
  if (signedIn === false) return local;
  const res = await fetch(`/api/account/data?name=${encodeURIComponent(name)}`, { cache: "no-store" }).catch(() => null);
  if (!res || res.status === 401 || res.status === 404) {
    if (res) signedIn = false;
    return local;
  }
  signedIn = true;
  if (!res.ok) return local;
  const { value } = (await res.json()) as { value: string | null };
  if (value !== null) {
    writeLocal(name, value);
    return value;
  }
  if (local) void push(name, local);
  return local;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, string>();

// Leaving the page sends anything still waiting, so the last edit before closing a tab isn't lost.
if (typeof window !== "undefined")
  window.addEventListener("pagehide", () => {
    for (const [name, value] of pending) void push(name, value);
    pending.clear();
  });

function push(name: string, value: string) {
  return fetch("/api/account/data", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, value }), keepalive: true }).catch(() => null);
}

/** Saves to this browser now and to the account a moment later, once typing pauses. */
export function persist(name: string, value: string) {
  writeLocal(name, value);
  if (signedIn !== true) return;
  clearTimeout(timers.get(name));
  pending.set(name, value);
  timers.set(
    name,
    setTimeout(() => {
      pending.delete(name);
      void push(name, value);
    }, 800),
  );
}
