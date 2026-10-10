import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { TestWatch } from "../lib/db/types";
import type { AdvertiserAd } from "../lib/signals/adlibrary-apify";

process.env.TRND_DEMO_DIR = mkdtempSync(path.join(tmpdir(), "trnd-watch-"));

const { createDemoRepo } = await import("../lib/db/demo/repo");
const { checkWatches } = await import("../lib/watch/check");
const { confirmEmail, rivalLine, stageEmail } = await import("../lib/email/test-watch");
const { contentWords, findLaunchedAd, rivalState, stepWatch, READ_CAP } = await import("../lib/watch/match");
const { parseWatchRequest } = await import("../lib/watch/create");

/**
 * The free read's loop: a watched test found going live in the Ad Library,
 * followed past three weeks and to its end, against the rival ad it was
 * modeled on, one email per stage and never twice.
 */

const NOW = new Date("2026-10-20T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400_000).toISOString().slice(0, 10);

function ad(id: string, startedDaysAgo: number, snippet: string, advertiser = "Jolie", active = true): AdvertiserAd {
  return { id, advertiser, snippet, headline: null, cta: null, landing: null, startedOn: daysAgo(startedDaysAgo), runningDays: startedDaysAgo, platforms: [], variants: 1, active, url: `https://x/${id}` };
}

function watch(over: Partial<TestWatch> = {}): TestWatch {
  return {
    id: "w1",
    token: "tok",
    email: "founder@jolie.com",
    website: "https://jolieskinco.com",
    domain: "jolieskinco.com",
    brand_name: "Jolie",
    title: "It was never your shampoo",
    hook: "You've changed shampoo three times. It was never the shampoo.",
    on_screen: "It was never the shampoo.",
    rival: { advertiser: "Clearwell", text: "Hair that feels like straw after every shower is a water problem, not a shampoo problem.", startedOn: daysAgo(140) },
    status: "watching",
    matched_ad: null,
    stages_sent: ["confirm"],
    confirmed_at: new Date(NOW.getTime() - 10 * 86400_000).toISOString(),
    live_at: null,
    ended_at: null,
    last_checked_at: null,
    created_at: new Date(NOW.getTime() - 10 * 86400_000).toISOString(),
    ...over,
  };
}

const LAUNCH = "Changed your shampoo three times already? It was never the shampoo. It's the water.";

describe("finding the launch", () => {
  it("reads words that carry meaning", () => {
    expect(contentWords("You've changed shampoo three times. It was never the shampoo.")).toEqual(["youve", "changed", "shampoo", "times", "never"]);
  });

  it("takes a new ad carrying the hook's words, and ignores old or unrelated ones", () => {
    const ads = [ad("old", 40, LAUNCH), ad("other", 3, "Free shipping on every showerhead this week."), ad("new", 4, LAUNCH)];
    expect(findLaunchedAd(ads, watch())?.id).toBe("new");
    expect(findLaunchedAd([ad("other", 3, "Free shipping on every showerhead.")], watch())).toBeNull();
  });

  it("matches on the on-screen line when the voiceover was rewritten", () => {
    const rewritten = ad("new", 2, "It was never the shampoo. Meet the filtered showerhead.");
    expect(findLaunchedAd([rewritten], watch({ hook: "Three bottles on the ledge and your hair still snaps." }))?.id).toBe("new");
  });
});

describe("a day's decision", () => {
  it("goes live when the launch shows, with one email", () => {
    const step = stepWatch(watch(), [ad("new", 4, LAUNCH)], NOW);
    expect(step.stage).toBe("live");
    expect(step.patch.status).toBe("live");
    expect(step.patch.matched_ad?.id).toBe("new");
    expect(step.patch.stages_sent).toEqual(["confirm", "live"]);
  });

  it("decides nothing on a failed read, and expires a watch that never found its ad", () => {
    expect(stepWatch(watch(), null, NOW).stage).toBeNull();
    const old = watch({ confirmed_at: new Date(NOW.getTime() - 46 * 86400_000).toISOString() });
    const step = stepWatch(old, [], NOW);
    expect(step.stage).toBe("expired");
    expect(step.patch.status).toBe("expired");
  });

  const live = (over: Partial<TestWatch> = {}) =>
    watch({ status: "live", stages_sent: ["confirm", "live"], matched_ad: { id: "new", text: LAUNCH, startedOn: daysAgo(22), url: "https://x/new" }, ...over });

  it("writes once past three weeks, never twice", () => {
    const first = stepWatch(live(), [ad("new", 22, LAUNCH)], NOW);
    expect(first.stage).toBe("past_three_weeks");
    expect(first.days).toBe(22);
    const again = stepWatch(live({ stages_sent: ["confirm", "live", "past_three_weeks"] }), [ad("new", 23, LAUNCH)], NOW);
    expect(again.stage).toBeNull();
  });

  it("ends only after two misses a day apart, with how long it ran", () => {
    const miss = stepWatch(live(), [ad("other", 3, "Free shipping.")], NOW);
    expect(miss.stage).toBeNull();
    expect(miss.patch.matched_ad?.missedSince).toBe(NOW.toISOString());
    const missedYesterday = live({ matched_ad: { id: "new", text: LAUNCH, startedOn: daysAgo(22), url: "", missedSince: new Date(NOW.getTime() - 86400_000).toISOString() } });
    const end = stepWatch(missedYesterday, [], NOW);
    expect(end.stage).toBe("ended");
    expect(end.patch.status).toBe("ended");
    expect(end.days).toBe(21);
  });

  it("never ends on a full list, which may have pushed the ad off the end", () => {
    const full = Array.from({ length: READ_CAP }, (_, i) => ad(`a${i}`, 5, "Something else entirely."));
    const missedYesterday = live({ matched_ad: { id: "new", text: LAUNCH, startedOn: daysAgo(22), url: "", missedSince: new Date(NOW.getTime() - 86400_000).toISOString() } });
    expect(stepWatch(missedYesterday, full, NOW).stage).toBeNull();
  });
});

describe("the rival it was modeled on", () => {
  const w = watch();
  it("says running, stopped or what it last knew", () => {
    expect(rivalState(w.rival, [ad("c1", 140, w.rival!.text, "Clearwell")], NOW)).toEqual({ state: "running", days: 140 });
    expect(rivalState(w.rival, [ad("c2", 3, "20% off this weekend.", "Clearwell")], NOW)).toEqual({ state: "stopped" });
    expect(rivalState(w.rival, null, NOW)).toEqual({ state: "unknown", days: 140 });
    expect(rivalLine(w, { state: "running", days: 140 })).toBe("The ad you cheated off, Clearwell's, is still running at 140 days.");
  });
});

describe("the form", () => {
  const good = {
    email: "Founder@Jolie.com",
    website: "jolieskinco.com",
    brand: { name: "Jolie", domain: "jolieskinco.com" },
    brief: { title: "It was never your shampoo", hook: "It was never the shampoo.", onScreen: "none" },
    rival: { advertiser: "Clearwell", runningDays: 118, text: "It's the water." },
  };

  it("stores a checked, trimmed row with the rival back-dated from its running days", () => {
    const out = parseWatchRequest(good, NOW);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.row.email).toBe("founder@jolie.com");
    expect(out.row.on_screen).toBeNull();
    expect(out.row.rival?.startedOn).toBe(daysAgo(118));
    expect(out.row.token.length).toBeGreaterThanOrEqual(30);
  });

  it("refuses a bad email or a request without a read behind it", () => {
    expect(parseWatchRequest({ ...good, email: "nope" }, NOW).ok).toBe(false);
    expect(parseWatchRequest({ ...good, brief: null }, NOW).ok).toBe(false);
  });
});

describe("the emails", () => {
  it("asks to confirm on a page, and every later email carries a way to stop", () => {
    const c = confirmEmail(watch({ status: "pending" }));
    expect(c.html).toContain("/watch?confirm=tok");
    const live = stageEmail(watch({ status: "live", matched_ad: { id: "n", text: LAUNCH, startedOn: daysAgo(2), url: "" } }), "live", 2, { state: "running", days: 140 });
    expect(live.subject).toBe("Jolie: your version is live");
    expect(live.html).toContain("/watch?stop=tok");
    expect(live.html).toContain("still running at 140 days");
    expect(live.html).toContain("hint, not proof");
    expect(stageEmail(watch(), "ended", 21, { state: "stopped" }).subject).toBe("Jolie: your test stopped after 21 days");
  });
});

describe("the daily pass", () => {
  it("emails the launch once, shares a brand's read, and retries a failed send tomorrow", async () => {
    const repo = createDemoRepo({ kind: "admin" });
    const w = await repo.insertTestWatch({
      token: "t1",
      email: "a@jolie.com",
      website: "https://jolieskinco.com",
      domain: "jolieskinco.com",
      brand_name: "Jolie",
      title: "It was never your shampoo",
      hook: "You've changed shampoo three times. It was never the shampoo.",
      on_screen: null,
      rival: { advertiser: "Clearwell", text: "It's the water, not the shampoo.", startedOn: daysAgo(118) },
    });
    await repo.updateTestWatch(w.id, { status: "watching", confirmed_at: new Date(NOW.getTime() - 5 * 86400_000).toISOString() });

    const reads: string[] = [];
    const fetchAds = async (name: string) => {
      reads.push(name);
      return name === "Jolie" ? [ad("new", 3, LAUNCH)] : [ad("c1", 118, "It's the water, not the shampoo.", "Clearwell")];
    };
    const sent: string[] = [];

    const failed = await checkWatches(repo, { fetchAds, send: async () => false, available: () => true, now: NOW });
    expect(failed.emailed).toBe(0);
    expect((await repo.getTestWatchByToken("t1"))?.status).toBe("watching");

    const ok = await checkWatches(repo, { fetchAds, send: async (_to, e) => (sent.push(e.subject), true), available: () => true, now: NOW });
    expect(ok.emailed).toBe(1);
    expect(sent).toEqual(["Jolie: your version is live"]);
    expect((await repo.getTestWatchByToken("t1"))?.status).toBe("live");

    await checkWatches(repo, { fetchAds, send: async (_to, e) => (sent.push(e.subject), true), available: () => true, now: NOW });
    expect(sent).toHaveLength(1);
    expect(reads.filter((r) => r === "Jolie").length).toBe(3);
  });

  it("does nothing without the Ad Library key", async () => {
    const repo = createDemoRepo({ kind: "admin" });
    expect((await checkWatches(repo, { available: () => false })).skipped).toBe("APIFY_TOKEN unset");
  });
});
