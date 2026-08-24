"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button with a live pending state — used for server actions that can
 * take a few seconds (campaign generation especially, once Gemini is on).
 */
export default function SubmitButton({
  children,
  pendingLabel,
  className = "btn btn-primary",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? (
        <>
          <span
            aria-hidden="true"
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              border: "2px solid currentColor",
              borderTopColor: "transparent",
              display: "inline-block",
              animation: "spin 0.7s linear infinite",
            }}
          />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
