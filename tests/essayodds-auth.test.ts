import { describe, expect, it } from "vitest";

import { accountId, codeHash, isDataName, newCode, signSession, validEmail, verifySession } from "@/lib/essayodds/auth-core";

const secret = Buffer.alloc(32, 9).toString("base64");
const session = { uid: accountId("Nick@Example.com"), email: "nick@example.com", exp: Date.now() + 60_000 };

describe("accounts", () => {
  it("gives one account per email, whatever the case or spacing", () => {
    expect(accountId(" NICK@example.com ")).toBe(accountId("nick@example.com"));
    expect(accountId("a@example.com")).not.toBe(accountId("b@example.com"));
  });
  it("makes 6-digit codes and hashes them per account", () => {
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^\d{6}$/);
    expect(codeHash("u1", "123456")).not.toBe(codeHash("u2", "123456"));
    expect(codeHash("u1", " 123456 ")).toBe(codeHash("u1", "123456"));
  });
  it("accepts its own session and nothing tampered, expired or signed with another key", () => {
    const token = signSession(session, secret);
    expect(verifySession(token, secret)).toEqual(session);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...session, email: "someone@else.com" })).toString("base64url");
    expect(verifySession(`${forged}.${sig}`, secret)).toBeNull();
    expect(verifySession(`${body}.${sig}x`, secret)).toBeNull();
    expect(verifySession(token, Buffer.alloc(32, 1).toString("base64"))).toBeNull();
    expect(verifySession(signSession({ ...session, exp: Date.now() - 1 }, secret), secret)).toBeNull();
    expect(verifySession(undefined, secret)).toBeNull();
  });
  it("only saves the work it knows about", () => {
    expect(isDataName("essay-draft")).toBe(true);
    expect(isDataName("purchases")).toBe(false);
    expect(validEmail("nick@example.com")).toBe(true);
    expect(validEmail("nope")).toBe(false);
  });
});
