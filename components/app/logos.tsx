"use client";

import { createContext, useContext } from "react";

/** Company name (lowercased) → its domain, so any avatar given only a name can show the logo. */
const Logos = createContext<Record<string, string>>({});

export function LogoProvider({ domains, children }: { domains: Record<string, string>; children: React.ReactNode }) {
  return <Logos.Provider value={domains}>{children}</Logos.Provider>;
}

export const useLogoDomain = (name: string) => useContext(Logos)[name.trim().toLowerCase()] ?? null;
