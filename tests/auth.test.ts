import { describe, expect, it, vi } from "vitest";

/** Passwordless sign-up: the honeypot drops a bot's request without sending a code. */

const signInWithOtp = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/db/supabase", () => ({ createServerSupabase: async () => ({ auth: { signInWithOtp } }) }));
vi.mock("@/lib/env", () => ({ env: { siteUrl: "https://creators.test" } }));

const { sendCodeAction } = await import("@/lib/auth/actions");
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe("sendCodeAction", () => {
  it("sends a code to a person", async () => {
    expect(await sendCodeAction({}, form({ email: "Me@Example.com", next: "/app" }))).toEqual({ email: "me@example.com" });
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it("answers a filled honeypot like a real sign-up, and sends nothing", async () => {
    signInWithOtp.mockClear();
    expect(await sendCodeAction({}, form({ email: "bot@example.com", company_website: "https://spam.test" }))).toEqual({ email: "bot@example.com" });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});
