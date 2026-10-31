import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeDb } from "./fakes/supabase";

/** The weekly plan email's opt-out: the setting, the signed link, one-click unsubscribe. */

const db = { current: new FakeDb() };
const sent: { headers?: Record<string, string>; html: string }[] = [];

vi.mock("@/lib/db/supabase", () => ({ adminSupabase: () => db.current }));
vi.mock("@/lib/env", () => ({
  env: { siteUrl: "https://creators.example", cronSecret: "s", supabaseServiceRoleKey: "k", resendApiKey: "re", emailFrom: "TRND <x@y>" },
  isEmailConfigured: true,
}));

const { sendPlanEmail } = await import("@/lib/email");
const { unsubscribeToken, unsubscribeTokenOk } = await import("@/lib/auth/unsubscribe");
const route = await import("@/app/api/unsubscribe/route");

const body = { headline: "Lead with the *recipe*", summary: "s", ideas: [{ type: "borrow", hook: "This pasta", so: "why" }] } as never;
const sb = { auth: { admin: { getUserById: async () => ({ data: { user: { email: "a@b.c" } } }) } } } as never;

beforeEach(() => {
  db.current = new FakeDb();
  sent.length = 0;
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    return new Response("{}");
  });
});

describe("weekly plan email", () => {
  it("carries a working unsubscribe link and one-click headers", async () => {
    await sendPlanEmail(sb, { id: "c1", owner_id: "u1", handle: "a", email_plans: true } as never, body);
    expect(sent).toHaveLength(1);
    expect(sent[0].headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const link = sent[0].headers!["List-Unsubscribe"].slice(1, -1);
    expect(link).toBe(`https://creators.example/api/unsubscribe?c=c1&t=${unsubscribeToken("c1")}`);
    expect(sent[0].html).toContain("/unsubscribe?c=c1&amp;t=".replace("&amp;", "&"));
  });

  it("is not sent once turned off", async () => {
    await sendPlanEmail(sb, { id: "c1", owner_id: "u1", handle: "a", email_plans: false } as never, body);
    expect(sent).toHaveLength(0);
  });
});

describe("unsubscribe", () => {
  it("checks the token: another account's id or a made-up token fails", () => {
    const t = unsubscribeToken("c1");
    expect(unsubscribeTokenOk("c1", t)).toBe(true);
    expect(unsubscribeTokenOk("c2", t)).toBe(false);
    expect(unsubscribeTokenOk("c1", "x")).toBe(false);
    expect(unsubscribeTokenOk("c1", null)).toBe(false);
  });

  it("one-click POST turns the email off; a bad token changes nothing", async () => {
    db.current.rows("creators").push({ id: "c1", email_plans: true });
    const post = (q: string) => route.POST(new Request(`https://creators.example/api/unsubscribe?${q}`, { method: "POST" }));
    expect((await post(`c=c1&t=nope`)).status).toBe(400);
    expect(db.current.rows("creators")[0].email_plans).toBe(true);
    expect((await post(`c=c1&t=${unsubscribeToken("c1")}`)).status).toBe(200);
    expect(db.current.rows("creators")[0].email_plans).toBe(false);
    const fromPage = await post(`c=c1&t=${unsubscribeToken("c1")}&from=page`);
    expect(fromPage.status).toBe(303);
    expect(fromPage.headers.get("location")).toBe("https://creators.example/unsubscribe?done=1");
  });
});
