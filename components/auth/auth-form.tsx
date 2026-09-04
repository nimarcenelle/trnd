"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  magicLinkAction,
  signInAction,
  signUpAction,
  type AuthFormState,
} from "@/lib/auth/actions";

const initial: AuthFormState = {};

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, formAction, pending] = useActionState(
    mode === "login" ? signInAction : signUpAction,
    initial,
  );
  const [magicState, magicAction, magicPending] = useActionState(magicLinkAction, initial);

  return (
    <div>
      <form action={formAction}>
        {mode === "signup" && (
          <div className="field">
            <label htmlFor="full_name">Full name</label>
            <input id="full_name" name="full_name" type="text" placeholder="Jordan Lee" autoComplete="name" required />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" placeholder="jordan@yourbusiness.com" autoComplete="email" required />
        </div>
        <div className="field">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <label htmlFor="password">Password</label>
            {mode === "login" && (
              <Link href="/forgot" style={{ fontSize: 12, color: "var(--ink-faint)" }}>
                Forgot password?
              </Link>
            )}
          </div>
          <input
            id="password"
            name="password"
            type="password"
            placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={mode === "signup" ? 8 : undefined}
          />
        </div>
        {state.error && <p className="form-error">{state.error}</p>}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={pending}
          style={{ width: "100%", justifyContent: "center" }}
        >
          {pending ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
        {mode === "signup" && (
          <p style={{ fontSize: 11.5, color: "var(--ink-faint)", margin: "12px 0 0", textAlign: "center", lineHeight: 1.5 }}>
            By creating an account you agree to the{" "}
            <Link href="/terms" style={{ color: "var(--ink-faint)", textDecoration: "underline" }}>Terms</Link> and{" "}
            <Link href="/privacy" style={{ color: "var(--ink-faint)", textDecoration: "underline" }}>Privacy Policy</Link>.
          </p>
        )}
      </form>

      {mode === "login" && (
        <form action={magicAction} style={{ marginTop: 14 }}>
          <input type="hidden" name="email" id="magic-email" />
          <button
            type="submit"
            className="btn btn-ghost"
            disabled={magicPending}
            style={{ width: "100%", justifyContent: "center" }}
            onClick={(e) => {
              const email = (document.getElementById("email") as HTMLInputElement)?.value ?? "";
              (e.currentTarget.form!.elements.namedItem("email") as HTMLInputElement).value = email;
            }}
          >
            Email me a magic link instead
          </button>
          {magicState.error && <p className="form-error" style={{ marginTop: 10 }}>{magicState.error}</p>}
          {magicState.notice && (
            <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mint)", marginTop: 10 }}>
              {magicState.notice}
            </p>
          )}
        </form>
      )}

      <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 22, textAlign: "center" }}>
        {mode === "login" ? (
          <>
            New to TRND? <Link href="/signup" style={{ color: "var(--amber-text)" }}>Create an account</Link>
          </>
        ) : (
          <>
            Already have an account? <Link href="/login" style={{ color: "var(--amber-text)" }}>Sign in</Link>
          </>
        )}
      </p>
    </div>
  );
}
