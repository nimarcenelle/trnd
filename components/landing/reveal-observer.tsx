"use client";

import { useEffect } from "react";

/**
 * Opt-in reveal-on-scroll. Content is visible by default; the js-reveal class
 * is added only when IntersectionObserver actually exists, so a failed
 * observer can never leave a blank page. Mirrors design/trnd-landing.html.
 */
export default function RevealObserver() {
  useEffect(() => {
    const startMotion = () => document.documentElement.classList.add("motion-run");
    const events = ["pointerdown", "pointermove", "wheel", "scroll", "keydown", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, startMotion, { once: true, passive: true }));
    if (
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.remove("reveal-pending");
            e.target.classList.add("reveal-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    // Hide-and-reveal only what is still below the fold; anything already on
    // screen stays exactly as painted.
    const pending: Element[] = [];
    document.querySelectorAll(".reveal").forEach((el) => {
      if (el.getBoundingClientRect().top > window.innerHeight * 0.95) {
        el.classList.add("reveal-pending");
        pending.push(el);
        io.observe(el);
      }
    });
    // Safety net: if anything is still hidden after a while, show it.
    const t = setTimeout(
      () =>
        pending.forEach((el) => {
          el.classList.remove("reveal-pending");
          el.classList.add("reveal-in");
        }),
      4000,
    );
    return () => {
      events.forEach((e) => window.removeEventListener(e, startMotion));
      clearTimeout(t);
      io.disconnect();
    };
  }, []);
  return null;
}
