import { afterEach, describe, expect, it, vi } from "vitest";

import { getAdminUser } from "../lib/auth/admin";
import { env } from "../lib/env";

// The gate's only other input is "who is signed in?", which reads cookies.
// Stub it so each case is just the allowlist against one email.
const session = vi.hoisted(() => ({
  user: null as { id: string; email: string; fullName: string | null } | null,
}));

vi.mock("../lib/auth/session", () => ({
  getSessionUser: async () => session.user,
}));

const signedIn = (email: string) => {
  session.user = { id: "u1", email, fullName: "Founder" };
};

const allowlist = env.adminEmails;

afterEach(() => {
  env.adminEmails = allowlist;
  session.user = null;
});

describe("getAdminUser", () => {
  it("denies everyone when the allowlist is empty", async () => {
    env.adminEmails = [];
    signedIn("founder@usetrnd.com");
    expect(await getAdminUser()).toBeNull();
  });

  it("admits a listed email", async () => {
    env.adminEmails = ["founder@usetrnd.com"];
    signedIn("founder@usetrnd.com");
    expect(await getAdminUser()).toMatchObject({ email: "founder@usetrnd.com" });
  });

  it("matches the allowlist case-insensitively", async () => {
    env.adminEmails = ["founder@usetrnd.com"];
    signedIn("Founder@UseTRND.com");
    expect(await getAdminUser()).not.toBeNull();
  });

  it("denies an email that is not on the list", async () => {
    env.adminEmails = ["founder@usetrnd.com"];
    signedIn("someone@example.com");
    expect(await getAdminUser()).toBeNull();
  });

  it("denies a signed-out visitor", async () => {
    env.adminEmails = ["founder@usetrnd.com"];
    session.user = null;
    expect(await getAdminUser()).toBeNull();
  });
});
