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
          <div className="flex justify-between items-baseline">
            <label htmlFor="password">Password</label>
            {mode === "login" && (
              <Link className="text-[12px] text-ink-faint" href="/forgot">
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
        {state.notice && (
          <p className="font-mono text-[11.5px] text-mint leading-[1.5]">
            {state.notice}
          </p>
        )}
        <button
          type="submit"
          className="btn btn-primary w-full justify-center"
          disabled={pending}
         
        >
          {pending ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
        {mode === "signup" && (
          <p className="text-[11.5px] text-ink-faint mx-0 mt-3 mb-0 text-center leading-[1.5]">
            By creating an account you agree to the{" "}
            <Link className="text-ink-faint underline" href="/terms">Terms</Link> and{" "}
            <Link className="text-ink-faint underline" href="/privacy">Privacy Policy</Link>.
          </p>
        )}
      </form>

      {mode === "login" && (
        <form className="mt-[14px]" action={magicAction}>
          <input type="hidden" name="email" id="magic-email" />
          <button
            type="submit"
            className="btn btn-ghost w-full justify-center"
            disabled={magicPending}
           
            onClick={(e) => {
              const email = (document.getElementById("email") as HTMLInputElement)?.value ?? "";
              (e.currentTarget.form!.elements.namedItem("email") as HTMLInputElement).value = email;
            }}
          >
            Email me a magic link instead
          </button>
          {magicState.error && <p className="form-error mt-[10px]">{magicState.error}</p>}
          {magicState.notice && (
            <p className="font-mono text-[11px] text-mint mt-[10px]">
              {magicState.notice}
            </p>
          )}
        </form>
      )}

      <p className="text-[13.5px] text-ink-soft mt-[22px] text-center">
        {mode === "login" ? (
          <>
            New to TRND? <Link className="text-(--amber-text)" href="/signup">Create an account</Link>
          </>
        ) : (
          <>
            Already have an account? <Link className="text-(--amber-text)" href="/login">Sign in</Link>
          </>
        )}
      </p>
    </div>
  );
}
