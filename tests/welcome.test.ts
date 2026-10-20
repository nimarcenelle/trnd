import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeDb } from "./fakes/supabase";

/**
 * Welcome's "Who do you want to be like?": up to three handles the owner
 * picks, saved ahead of matched creators, never their own.
 */

const db = { current: new FakeDb() };
const me = { id: "c1", handle: "me", followers: 50_000 };

class Redirect extends Error {}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/data", () => ({ getCreator: async () => me }));
vi.mock("@/lib/db/supabase", () => ({ adminSupabase: () => db.current }));
vi.mock("@/lib/creators/scan", () => ({ scanCreator: async () => {} }));
vi.mock("@/lib/creators/create", () => ({ createCreator: async () => {} }));
vi.mock("@/lib/tiktok/connect", () => ({ disconnect: async () => {} }));
vi.mock("@/lib/env", () => ({ env: {}, isModelConfigured: true, isStripeConfigured: false, isTiktokLoginConfigured: false }));

const { welcomeModelsAction } = await import("@/lib/actions");

/** Submits the form; returns the error it shows, or where it redirected. */
async function submit(...handles: string[]): Promise<string> {
  const form = new FormData();
  for (const h of handles) form.append("handles", h);
  try {
    const state = await welcomeModelsAction({}, form);
    return state.error ?? "";
  } catch (e) {
    if (e instanceof Redirect) return `→ ${e.message}`;
    throw e;
  }
}
const peer = (handle: string, created_at: string, source: "owner" | "match" = "match", removed_at: string | null = null) => ({ id: `p-${handle}`, creator_id: "c1", handle, source, removed_at, created_at, reason: "10× your followers" });
const peers = () => db.current.rows("peers");
const live = () =>
  peers()
    .filter((p) => !p.removed_at)
    .map((p) => `${p.handle}:${p.source}`)
    .sort();

beforeEach(() => {
  db.current = new FakeDb();
});

describe("welcomeModelsAction", () => {
  it("quotes the handle that isn't one, and saves nothing", async () => {
    expect(await submit("@good_one", "not a handle!")).toBe(`"not a handle!" isn't a TikTok handle. Use their @name, like @theircreator.`);
    expect(peers()).toEqual([]);
  });

  it("keeps three at most, and never the account itself", async () => {
    expect(await submit("@me", "@one", "@two", "@one", "@three", "@four")).toBe("→ /app");
    expect(live()).toEqual(["one:owner", "three:owner", "two:owner"]);
  });

  it("makes room on a full list by removing the newest matched creators", async () => {
    peers().push(
      peer("own", "2026-10-01T00:00:00Z", "owner"),
      ...["m1", "m2", "m3", "m4", "m5", "m6", "m7"].map((h, i) => peer(h, `2026-10-0${i + 2}T00:00:00Z`)),
    );
    await submit("@new1", "@new2");
    // Eight stays eight: the two matched last (m7, m6) make way; the owner's own pick stays.
    expect(live()).toEqual(["m1:match", "m2:match", "m3:match", "m4:match", "m5:match", "new1:owner", "new2:owner", "own:owner"]);
  });

  it("brings back a removed creator as the owner's pick", async () => {
    peers().push(peer("back", "2026-10-01T00:00:00Z", "match", "2026-10-05T00:00:00Z"));
    await submit("@back");
    expect(peers()).toHaveLength(1);
    expect(peers()[0]).toMatchObject({ handle: "back", source: "owner", removed_at: null, reason: "Added by you" });
  });
});
