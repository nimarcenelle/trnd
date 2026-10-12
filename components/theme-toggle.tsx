"use client";

import { useSyncExternalStore } from "react";

/**
 * Dark is the brand default. Choosing light sets [data-theme="light"] on
 * <html>; the choice persists in localStorage and is applied pre-paint by
 * the inline script in app/layout.tsx. Icon visibility itself is pure CSS
 * (--sun-d / --moon-d), so this component only tracks state for a11y labels.
 */
const THEME_EVENT = "trnd-theme-change";

function subscribe(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

function getSnapshot(): boolean {
  return document.documentElement.getAttribute("data-theme") !== "light";
}

export default function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, getSnapshot, () => true);

  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("trnd-theme", next);
    } catch {
      /* private mode etc. — the toggle still works for this page */
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title="Toggle light / dark"
    >
      <svg
        className="ico-sun"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" />
      </svg>
      <svg
        className="ico-moon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1Z" />
      </svg>
    </button>
  );
}
