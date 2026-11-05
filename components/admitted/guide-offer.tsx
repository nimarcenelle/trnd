"use client";

import { useState, type FormEvent } from "react";

import { IconArrowRight } from "@/components/icons";

/** The free guide, in exchange for an email. */
export default function GuideOffer({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<"" | "busy" | "error">("");
  const [url, setUrl] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("busy");
    const res = await fetch("/api/guide", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: new FormData(e.currentTarget).get("email") }) }).catch(() => null);
    if (!res?.ok) {
      setState("error");
      return;
    }
    setUrl(((await res.json()) as { url: string }).url);
    setState("");
  }

  if (url)
    return (
      <div className={compact ? "" : "mt-6"}>
        <a className="btn btn-primary btn-lg" href={url} download>
          Download the guide <IconArrowRight />
        </a>
        <p className="caption mt-2">It&apos;s a PDF, five pages.</p>
      </div>
    );
  return (
    <form className={`flex flex-col sm:flex-row gap-2 ${compact ? "" : "mt-6"} max-w-[480px]`} onSubmit={(e) => void submit(e)}>
      <input className="input !h-11 flex-1" name="email" type="email" placeholder="Your email" aria-label="Your email" required />
      <button className="btn btn-primary btn-lg shrink-0" type="submit" disabled={state === "busy"}>
        {state === "busy" ? "Sending…" : "Get the free guide"}
      </button>
      {state === "error" && <p className="text-[13px] text-neg sm:self-center">Check the email and try again.</p>}
    </form>
  );
}
