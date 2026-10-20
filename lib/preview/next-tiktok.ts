import type { Idea } from "@/lib/db/types";

/** What the "Your next TikTok" frame shows: the page and the shareable card read the same thing. */
export interface NextTikTok {
  handle: string;
  hook: string;
  caption: string;
  hashtags: string[];
  sound: string;
}

/** The hook as on-screen text: the plan writes it as a quote ("…"), the screen shows the words. */
export function onScreenHook(hook: string): string {
  let s = hook.trim().replace(/\s+/g, " ");
  while (s.length > 1 && /^["“”'‘’]/.test(s) && /["“”'‘’]$/.test(s)) s = s.slice(1, -1).trim();
  return s;
}

/** Hashtags with one leading #, no blanks, no repeats (any case), at most five: what fits under a caption. */
export function tagList(tags: string[], max = 5): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const word = t.trim().replace(/^#+/, "").replace(/\s+/g, "");
    if (!word || seen.has(word.toLowerCase())) continue;
    seen.add(word.toLowerCase());
    out.push(`#${word}`);
    if (out.length === max) break;
  }
  return out;
}

export function nextTikTok(handle: string, idea: Pick<Idea, "hook" | "caption" | "hashtags" | "sound">): NextTikTok {
  return {
    handle: handle.replace(/^@+/, ""),
    hook: onScreenHook(idea.hook),
    caption: idea.caption.trim(),
    hashtags: tagList(idea.hashtags),
    sound: idea.sound.trim() || "Original sound",
  };
}

/**
 * How big the hook sits on screen, as a share of the frame's width. Short hooks
 * fill the screen; long ones step down so they never run under the caption.
 */
export function hookScale(hook: string): number {
  const n = hook.length;
  if (n <= 32) return 0.088;
  if (n <= 56) return 0.074;
  if (n <= 84) return 0.064;
  return 0.056;
}

/** The saved image's file name: the handle, safe for any file system. */
export function cardFileName(handle: string): string {
  const safe = handle.replace(/^@+/, "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 40) || "creator";
  return `next-tiktok-${safe}.png`;
}
