/** Pure rules for a "request a school" entry. Safe for the browser. */
export const parseSchoolRequest = (school: unknown, email: unknown): { school: string; email: string } | null => {
  const s = String(school ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  const e = String(email ?? "").trim().toLowerCase().slice(0, 200);
  return s.length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? { school: s, email: e } : null;
};
