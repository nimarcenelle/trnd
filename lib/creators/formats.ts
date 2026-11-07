/**
 * The fixed list of video formats the tagger chooses from, and the mapping that
 * puts the free-text formats stored before the list existed ("talking head tip",
 * "relatable skit", "song promo") under one of them. A format count is only
 * worth showing when "ranked list" and "top 3 list" are counted as one format.
 *
 * A format is the kind of video, the thing someone else can copy; never its
 * topic. Twenty, so each holds enough videos to count.
 */

export const FORMATS = [
  "ranked list",
  "tutorial",
  "quick tip",
  "explainer",
  "storytime",
  "talking head",
  "q&a reply",
  "reaction",
  "pov skit",
  "trend or challenge",
  "day in my life",
  "get ready with me",
  "before and after",
  "outfit or look",
  "product review",
  "series part",
  "street interview",
  "music performance",
  "song teaser",
  "montage or clip",
] as const;

export type FormatKey = (typeof FORMATS)[number];

/** What each format covers, for the tagger: one line each, so it picks the same one every time. */
export const FORMAT_HINT: Record<FormatKey, string> = {
  "ranked list": "a ranking, top 3, tier list, or this vs that comparison",
  tutorial: "showing how to do or make something, step by step (recipes, makeup, builds)",
  "quick tip": "one tip, hack or piece of advice, usually said to camera",
  explainer: "explaining how or why something works, a breakdown, myth vs fact",
  storytime: "telling a story that happened to them",
  "talking head": "talking to camera: an opinion, a rant, commentary, an update or announcement",
  "q&a reply": "answering a comment or a question from a viewer",
  reaction: "reacting to another video or a product, a stitch or duet",
  "pov skit": "an acted scene: a POV, a sketch, a relatable or comedy skit",
  "trend or challenge": "joining a trend, challenge, dance, lip sync or transition",
  "day in my life": "a vlog of their day, a routine, a 'with me' video, an event or trip",
  "get ready with me": "getting ready while talking (GRWM)",
  "before and after": "a transformation or glow up, the result revealed",
  "outfit or look": "showing an outfit, costume, makeup or hair look",
  "product review": "reviewing, unboxing, demoing or hauling products",
  "series part": "one part of a numbered series they run",
  "street interview": "asking people questions on camera",
  "music performance": "singing or playing a song: an original, a cover",
  "song teaser": "a snippet of an unreleased song, a release or pre-save ask",
  "montage or clip": "an edit, montage, photo dump, throwback or a short candid clip",
};

/** How a format reads on the page: sentence case, with its acronyms kept. */
const DISPLAY: Partial<Record<FormatKey, string>> = { "q&a reply": "Q&A reply", "pov skit": "POV skit" };

/**
 * Free text the tagger wrote before the list, matched by its words. Order
 * matters: what kind of video it is wins over what it is about, so "costume
 * skit" is a skit and "talking head tip" a tip.
 */
const RULES: [RegExp, FormatKey][] = [
  [/\bgrwm\b|get ready/, "get ready with me"],
  [/\bseries\b|\bpart \d|\bepisode\b|\bep \d/, "series part"],
  [/q ?& ?a|\breply\b|\banswer|\bquestions?\b/, "q&a reply"],
  [/\breact|\bstitch\b|\bduet\b/, "reaction"],
  [/before and after|before & after|transformation|glow ?up|makeover|progress|skin update/, "before and after"],
  [/\brank|\btop \d|\btier\b|levels list|\bvs\b|versus|comparison|compare|this or that/, "ranked list"],
  [/tutorial|how ?to|step by step|recipe|\bdiy\b|cook with me|build process/, "tutorial"],
  [/\b(song|music|track) (teaser|promo)|^teaser|snippet|pre-?save|\brelease|unreleased/, "song teaser"],
  [/interview/, "street interview"],
  [/\bskit\b|\bpov\b|sketch|comedy|parody|relatable/, "pov skit"],
  [/\btrend|challenge|lip ?sync|\bdance|transition|filter|\bmeme/, "trend or challenge"],
  [/\btips?\b|\bhacks?\b|advice|guide/, "quick tip"],
  [/explain|breakdown|\bmyth|\bfacts?\b|deep dive|lesson/, "explainer"],
  [/\bstory/, "storytime"],
  [/review|unboxing|\bhaul\b|product|\bdemo\b|showcase|try ?on|taste test/, "product review"],
  [/performance|\bcover\b|original song|singing|\bsong\b|artist intro/, "music performance"],
  [/day in|\bvlog|routine|with me|\btour\b|behind the scenes|\bbts\b|date night|\bevent|\bprep\b|recap|\bvisit\b/, "day in my life"],
  [/outfit|\bootd\b|costume|fashion|makeup|\bhair\b|\blook\b/, "outfit or look"],
  [/\bedit\b|montage|photo dump|compilation/, "montage or clip"],
  [/talking head|\brant\b|commentary|opinion|hot take|\bupdate\b|announcement|message|endorsement|advocacy|appreciation|motivation/, "talking head"],
  [/\bclip\b|throwback|aesthetic|\bmoment\b|\bpet\b|\bquote\b/, "montage or clip"],
  [/\breveal\b/, "before and after"],
];

const KEYS = new Set<string>(FORMATS);

/** The format from the fixed list a stored or returned format is; null when none fits ("unknown"). */
export function normalizeFormat(raw: string | null | undefined): FormatKey | null {
  const s = (raw ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (KEYS.has(s)) return s as FormatKey;
  for (const [re, key] of RULES) if (re.test(s)) return key;
  return null;
}

/** A format as shown: the list's name for it in sentence case, or the stored text when it maps to none. */
export function formatLabel(raw: string | null | undefined): string {
  const key = normalizeFormat(raw);
  const s = key ? (DISPLAY[key] ?? key) : (raw ?? "").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}
