/**
 * Which market reads are actually running, from which keys are set.
 *
 * Settings used to print one fixed list ("... Meta ads, TikTok, YouTube")
 * whatever was configured, and the YouTube key was never set: the line
 * claimed a source that had never contributed a row. Everything the owner
 * is told is read has to be something that ran. Pure, so the mapping from
 * keys to claims is tested, and the settings page only prints it.
 */

export interface SourceFlags {
  dataForSeo: boolean;
  youtube: boolean;
  apify: boolean;
  reddit: boolean;
  x: boolean;
  instagram: boolean;
}

export interface LiveSources {
  /** Reads that run with the keys as set, in the order they matter. */
  on: string[];
  /** Reads that exist in code and are waiting on a key, with what they need. */
  off: { name: string; needs: string }[];
}

export function liveSources(f: SourceFlags): LiveSources {
  const on: string[] = [];
  const off: LiveSources["off"] = [];
  const add = (live: boolean, name: string, needs: string) => (live ? on.push(name) : off.push({ name, needs }));

  add(f.dataForSeo, "Search volume by metro", "a DataForSEO account");
  on.push("Google Trends", "Autocomplete");
  add(f.youtube, "YouTube Shorts", "a YouTube Data API key (free)");
  on.push("TikTok trending board");
  add(f.apify, "TikTok profiles", "an Apify token");
  add(f.reddit, "Reddit", "a Reddit script app (free)");
  add(f.instagram, "Instagram posts", "our own Instagram professional account");
  add(f.x, "X", "a paid X tier");
  add(f.apify, "Rival Meta ads", "an Apify token");
  return { on, off };
}

/** "Search volume by metro, Google Trends, ..., TikTok trending board" */
export function liveSourcesLine(s: LiveSources): string {
  return s.on.join(", ");
}

/** "Refreshed daily. Not yet reading YouTube Shorts and Reddit." */
export function liveSourcesNote(s: LiveSources, metro: boolean): string {
  const head = metro ? "Refreshed daily. Search volume is measured in your metro." : "Refreshed daily. Search reads are national until metro volume is available for your workspace.";
  if (s.off.length === 0) return head;
  const names = s.off.map((o) => o.name);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${head} Not yet reading ${list}.`;
}
