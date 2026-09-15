"use client";

import { useEffect, useState } from "react";

/** Persistent application CTA that appears once the hero's own buttons scroll away. */
export default function FloatingCta() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 640);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <a href="#pilot" className={`float-cta${show ? " float-cta--on" : ""}`} aria-hidden={!show} tabIndex={show ? 0 : -1}>
      Apply for the pilot
    </a>
  );
}