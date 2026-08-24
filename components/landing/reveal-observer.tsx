"use client";

import { useEffect } from "react";

/**
 * Opt-in reveal-on-scroll. Content is visible by default; the js-reveal class
 * is added only when IntersectionObserver actually exists, so a failed
 * observer can never leave a blank page. Mirrors design/trnd-landing.html.
 */
export default function RevealObserver() {
  useEffect(() => {
    if (
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const els = document.querySelectorAll(".reveal");
    document.documentElement.classList.add("js-reveal");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    // Safety net: if anything is still hidden shortly after load, show it.
    const t = setTimeout(() => els.forEach((el) => el.classList.add("in")), 1500);
    return () => {
      clearTimeout(t);
      io.disconnect();
      document.documentElement.classList.remove("js-reveal");
    };
  }, []);
  return null;
}
