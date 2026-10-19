"use client";

import { useEffect } from "react";

/** Closes an open popover (<details data-popover>) on a click outside it or on Escape. Mounted once per layout. */
export default function DismissPopovers() {
  useEffect(() => {
    const close = (keep?: Node | null) =>
      document.querySelectorAll<HTMLDetailsElement>("details[data-popover][open]").forEach((d) => {
        if (!keep || !d.contains(keep)) d.open = false;
      });
    const onClick = (e: MouseEvent) => close(e.target as Node);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return null;
}
