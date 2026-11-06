"use client";

import { useState } from "react";

import { logShareAction } from "@/lib/creator/actions";

/**
 * Turning a result into a post: the share sheet (with the story image
 * attached, where the phone allows it, so it goes straight into TikTok or
 * Instagram), the image itself, the link, and a replay for screen recording.
 */
export default function ShareBar({ id, handle, onReplay }: { id: string; handle: string; onReplay?: () => void }) {
  const [copied, setCopied] = useState(false);
  const page = () => `${window.location.origin}/c/${id}`;
  const image = `/c/${id}/story`;
  const text = `My last 12 posts, measured. Check yours free:`;

  async function share() {
    try {
      const blob = await fetch(image).then((r) => r.blob());
      const file = new File([blob], `trnd-${handle}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: `${text} ${page()}` });
      } else if (navigator.share) {
        await navigator.share({ url: page(), text });
      } else {
        await copy();
        return;
      }
      void logShareAction(id, "native");
    } catch {
      /* the sheet was closed */
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(page());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy the link:", page());
    }
    void logShareAction(id, "link");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn btn-primary" onClick={share}>
        Share my result
      </button>
      <a className="btn btn-secondary" href={`${image}?dl=1`} download={`trnd-${handle}.png`} onClick={() => void logShareAction(id, "image")}>
        Save story image
      </a>
      <button type="button" className="btn btn-secondary" onClick={copy}>
        {copied ? "Copied" : "Copy link"}
      </button>
      {onReplay && (
        <button type="button" className="btn btn-ghost" onClick={onReplay} title="Plays the numbers and bars again, for a screen recording">
          Replay
        </button>
      )}
    </div>
  );
}
