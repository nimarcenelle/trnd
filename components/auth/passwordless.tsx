"use client";

import Link from "next/link";
import { useActionState } from "react";

import SubmitButton from "@/components/app/submit-button";
import { googleAction, sendCodeAction, verifyCodeAction, type AuthFormState } from "@/lib/auth/actions";

type State = AuthFormState & { email?: string };

const GOOGLE = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1";

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="w-[18px] h-[18px]" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

/**
 * Sign up and sign in without a password: Continue with Google, or an emailed
 * 6-digit code. One form for both: the first code creates the account.
 */
export default function Passwordless({ next, mode }: { next: string; mode: "signup" | "login" }) {
  const [sent, send] = useActionState<State, FormData>(sendCodeAction, {});
  const [checked, verify] = useActionState<State, FormData>(verifyCodeAction, {});
  const email = checked.email ?? sent.email;

  if (email) {
    return (
      <div className="grid gap-3">
      <form action={verify} className="grid gap-3">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next} />
        <p className="text-[14px] text-ink-2">
          We sent a 6-digit code to <strong className="text-ink">{email}</strong>. It expires in an hour.
        </p>
        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold">Code</span>
          <input
            className="input !h-12 mono !text-[22px] tracking-[0.4em] text-center"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={8}
            placeholder="······"
            autoFocus
            required
          />
        </label>
        {checked.error && <p className="form-error !m-0">{checked.error}</p>}
        <SubmitButton className="btn btn-primary btn-lg w-full" pending="Checking…">
          {mode === "signup" ? "Create my account" : "Sign in"}
        </SubmitButton>
      </form>
      <form action={send} className="justify-self-center">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next} />
        <button type="submit" className="btn btn-ghost btn-sm">
          Send a new code
        </button>
      </form>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {GOOGLE && (
        <>
          <form action={googleAction}>
            <input type="hidden" name="next" value={next} />
            <SubmitButton className="btn btn-lg w-full !gap-2.5" pending="Opening Google…">
              <GoogleMark /> Continue with Google
            </SubmitButton>
          </form>
          <div className="flex items-center gap-3 caption">
            <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}
      <form action={send} className="grid gap-3">
        <input type="hidden" name="next" value={next} />
        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold">Email</span>
          <input className="input !h-11" name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
        </label>
        {sent.error && <p className="form-error !m-0">{sent.error}</p>}
        <SubmitButton className="btn btn-primary btn-lg w-full" pending="Sending…">
          Email me a code
        </SubmitButton>
      </form>
      {mode === "signup" ? (
        <p className="text-[12px] text-ink-3 text-center leading-[1.5]">
          No password needed. By continuing you agree to the{" "}
          <Link className="underline" href="/terms">
            Terms
          </Link>{" "}
          and{" "}
          <Link className="underline" href="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      ) : (
        <p className="text-[13px] text-ink-2 text-center">
          New here?{" "}
          <Link className="text-ink font-semibold hover:underline" href="/">
            Get your free plan
          </Link>
        </p>
      )}
    </div>
  );
}
