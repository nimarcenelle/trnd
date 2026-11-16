/** Pure rules for an email someone leaves. Safe for the browser. */
export const parseEmail = (email: unknown): string | null => {
  const e = String(email ?? "").trim().toLowerCase().slice(0, 200);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
};

export const GUIDE_PATH = "/guides/7-essay-mistakes.pdf";
