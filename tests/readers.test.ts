import { describe, expect, it } from "vitest";

import { apiError, EU, fromArchive } from "@/lib/adlibrary/api";
import { CookieJar, jsDatr, parseSetCookies } from "@/lib/adlibrary/session";

describe("browser session", () => {
  it("keeps the cookies Facebook sets, including the datr its page sets from script", () => {
    expect(parseSetCookies(["fr=abc; Path=/; HttpOnly", "sb=xyz; Secure", "c_user=deleted; expires=Thu, 01 Jan 1970", "bad"])).toEqual([
      ["fr", "abc"],
      ["sb", "xyz"],
    ]);
    expect(jsDatr('requireLazy(["CookieCore"]);["_js_datr","Dk3f_9aZ",86400]')).toBe("Dk3f_9aZ");
    const jar = new CookieJar();
    expect(jar.warm).toBe(false);
    const res = new Response("", { headers: [["set-cookie", "fr=abc; Path=/"]] });
    jar.take(res, '["_js_datr","D1",1]');
    jar.markWarm();
    expect(jar.header()).toBe("fr=abc; datr=D1");
    expect(jar.warm).toBe(true);
    jar.reset();
    expect(jar.header()).toBe("");
  });
});

describe("Meta Ad Library API", () => {
  it("maps an archive record, taking the domain from the link caption", () => {
    const ad = fromArchive({
      id: "123",
      page_id: "999",
      page_name: "SLAP",
      ad_creative_bodies: ["Art you peel and stick.", "Art you peel and stick.", "No holes, no nails."],
      ad_creative_link_titles: ["Shop SLAP"],
      ad_creative_link_captions: ["SLAP.ART"],
      ad_delivery_start_time: "2026-09-01T07:00:00+0000",
      publisher_platforms: ["FACEBOOK", "INSTAGRAM"],
      eu_total_reach: 48210,
    });
    expect(ad).toMatchObject({
      archiveId: "123",
      pageId: "999",
      pageName: "SLAP",
      body: "Art you peel and stick.",
      title: "Shop SLAP",
      linkUrl: "https://slap.art",
      platforms: ["facebook", "instagram"],
      variants: 2,
      startedAt: "2026-09-01",
      reach: 48210,
      imageUrl: null,
    });
    expect(fromArchive({ page_name: "no id" })).toBeNull();
    expect(EU).toHaveLength(27);
  });

  it("turns Graph errors into something the owner can act on", () => {
    expect(apiError(400, { error: { code: 190, message: "expired" } })).toMatch(/expired.*META_ACCESS_TOKEN/);
    expect(apiError(400, { error: { code: 10 } })).toMatch(/confirm your ID/);
    expect(apiError(400, { error: { code: 613 } })).toMatch(/rate limit/);
    expect(apiError(500, null)).toBe("Meta's API answered 500");
  });
});
