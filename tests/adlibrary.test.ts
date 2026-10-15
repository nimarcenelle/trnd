import { describe, expect, it } from "vitest";

import { pageFromHtml } from "@/lib/adlibrary/facebook";
import { domainOf, facebookHandle, nameCore, pickRivalPage, sameName, scorePages } from "@/lib/adlibrary/match";
import { graphqlBlocks, jsonBlocks, looksBlocked, pageTokens, parsePayloads, toScrapedAd } from "@/lib/adlibrary/parse";
import { challengePath, docIdFromBundle, libraryUrl, sessionParams } from "@/lib/adlibrary/scrape";
import { facebookRef } from "@/lib/site";

/** An ad node in the shape the Ad Library ships it (search_results_connection → edges → collated_results). */
function adNode(id: string, over: Record<string, unknown> = {}, snap: Record<string, unknown> = {}) {
  return {
    ad_archive_id: id,
    page_id: "111",
    page_name: "Glow Labs",
    is_active: true,
    start_date: 1_725_148_800, // 2024-09-01
    publisher_platform: ["FACEBOOK", "INSTAGRAM"],
    collation_count: 3,
    snapshot: {
      body: { text: "Your skin, but better. 30-day guarantee." },
      title: "Glow Serum",
      cta_text: "Shop now",
      link_url: "https://glowlabs.com/serum",
      display_format: "VIDEO",
      images: [],
      videos: [{ video_hd_url: "https://video.example/hd.mp4", video_preview_image_url: "https://img.example/poster.jpg" }],
      cards: [],
      ...snap,
    },
    ...over,
  };
}

function libraryHtml(nodes: unknown[], pageInfo = { end_cursor: "CURSOR1", has_next_page: true }, count = 42) {
  const payload = {
    require: [
      [
        "ScheduledServerJS",
        "handle",
        null,
        [
          {
            __bbox: {
              result: {
                data: {
                  ad_library_main: {
                    search_results_connection: { count, page_info: pageInfo, edges: [{ node: { collated_results: nodes } }] },
                  },
                },
              },
            },
          },
        ],
      ],
    ],
  };
  return `<!DOCTYPE html><html><head><script>["LSD",[],{"token":"AVq-lsd"}]</script></head><body>
<script type="application/json" data-sjs>{"not":"ads"}</script>
<script type="application/json" data-content-len="999" data-sjs>${JSON.stringify(payload)}</script>
<script>{"__d":"AdLibrarySearchPaginationQuery_facebookRelayOperation","queryID":"987654321"}</script>
</body></html>`;
}

describe("parse", () => {
  it("finds ads and paging in the library page's embedded JSON", () => {
    const html = libraryHtml([adNode("1"), adNode("2"), adNode("1")]);
    const res = parsePayloads(jsonBlocks(html));
    expect(res.ads.map((a) => a.archiveId)).toEqual(["1", "2"]);
    expect(res.count).toBe(42);
    expect(res.cursor).toBe("CURSOR1");
    expect(res.hasNext).toBe(true);
    const ad = res.ads[0];
    expect(ad).toMatchObject({
      pageId: "111",
      pageName: "Glow Labs",
      body: "Your skin, but better. 30-day guarantee.",
      title: "Glow Serum",
      cta: "Shop now",
      format: "video",
      videoUrl: "https://video.example/hd.mp4",
      imageUrl: "https://img.example/poster.jpg",
      platforms: ["facebook", "instagram"],
      variants: 3,
      startedAt: "2024-09-01",
      active: true,
    });
  });

  it("reads the pagination tokens", () => {
    expect(pageTokens(libraryHtml([]))).toEqual({ lsd: "AVq-lsd", docId: "987654321" });
  });

  it("reads a for(;;)-prefixed, multi-line GraphQL answer", () => {
    const page = { data: { ad_library_main: { search_results_connection: { page_info: { end_cursor: null, has_next_page: false }, edges: [{ node: { collated_results: [adNode("3")] } }] } } } };
    const text = `for (;;);${JSON.stringify(page)}\n{"extensions":{"is_final":true}}`;
    const res = parsePayloads(graphqlBlocks(text));
    expect(res.ads.map((a) => a.archiveId)).toEqual(["3"]);
    expect(res.hasNext).toBe(false);
  });

  it("takes copy from the first card when the body is a product template", () => {
    const ad = toScrapedAd(
      adNode("4", {}, {
        body: { text: "{{product.brand}}" },
        display_format: "DCO",
        videos: [],
        cards: [{ body: "Bundle and save 20%", title: "The Kit", original_image_url: "https://img.example/card.jpg" }],
      }),
    );
    expect(ad).toMatchObject({ body: "Bundle and save 20%", format: "dco", imageUrl: "https://img.example/card.jpg", title: "Glow Serum" });
  });

  it("calls a multi-card ad a carousel and reads markup bodies", () => {
    const ad = toScrapedAd(
      adNode("5", {}, { display_format: "", videos: [], body: { markup: { __html: "Hello<br/>world" } }, cards: [{ title: "a" }, { title: "b" }] }),
    );
    expect(ad).toMatchObject({ format: "carousel", body: "Hello world" });
  });

  it("parses Apify dataset items, which share Meta's shape", () => {
    expect(parsePayloads([[adNode("6"), adNode("7")]]).ads).toHaveLength(2);
  });

  it("spots a login wall", () => {
    expect(looksBlocked('<form id="login_form" action="/login/">')).toBe(true);
    expect(looksBlocked(libraryHtml([]))).toBe(false);
  });
});

describe("match", () => {
  it("compares names without the generic words", () => {
    expect(nameCore("The Glow Co.")).toEqual(["glow"]);
    expect(sameName("Act+Acre", "ActandAcre")).toBe(true);
    expect(sameName("Roz", "Roz Strategies")).toBe(false);
  });

  it("normalizes domains", () => {
    expect(domainOf("https://www.Glowlabs.com/serum?x=1")).toBe("glowlabs.com");
    expect(domainOf("shop.glowlabs.com")).toBe("glowlabs.com");
    expect(domainOf("")).toBeNull();
  });

  it("picks the rival's own Page out of a keyword search", () => {
    const ads = [
      toScrapedAd(adNode("1", { page_id: "999", page_name: "Glow Labs Reviews" }, { link_url: "https://other.com" }))!,
      toScrapedAd(adNode("2", { page_id: "111", page_name: "GlowLabs Official" }, { link_url: "https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.glowlabs.com%2Fp" }))!,
    ];
    expect(pickRivalPage({ name: "Glow Labs", website: "glowlabs.com" }, ads)).toEqual({ pageId: "111", pageName: "GlowLabs Official" });
    expect(pickRivalPage({ name: "Nobody", website: "nobody.com" }, ads)).toBeNull();
  });
});

describe("libraryUrl", () => {
  it("asks for active ads in every country, most impressions first", () => {
    const u = new URL(libraryUrl({ pageId: "111" }));
    expect(u.searchParams.get("view_all_page_id")).toBe("111");
    expect(u.searchParams.get("search_type")).toBe("page");
    expect(u.searchParams.get("active_status")).toBe("active");
    expect(u.searchParams.get("country")).toBe("ALL");
    expect(u.searchParams.get("sort_data[mode]")).toBe("total_impressions");
    expect(new URL(libraryUrl({ query: "glow labs" })).searchParams.get("q")).toBe("glow labs");
  });
});

describe("finding the right Page", () => {
  it("never takes a Page on its name alone", () => {
    const ads = [
      toScrapedAd(adNode("1", { page_id: "777", page_name: "Jolie" }, { link_url: "https://myjolie.ro/body", page_profile_uri: "https://www.facebook.com/myjolie.ro/" }))!,
    ];
    const rival = { name: "Jolie", website: "jolieskin.co" };
    expect(scorePages(rival, ads)[0]).toMatchObject({ pageId: "777", points: 2, pageUrl: "https://www.facebook.com/myjolie.ro/" });
    expect(pickRivalPage(rival, ads)).toBeNull();
  });

  it("is sure of a Page the company's site links to", () => {
    const ads = [toScrapedAd(adNode("1", { page_id: "555", page_name: "Jolie Skin Co" }, { link_url: "https://amazon.com/x", page_profile_uri: "https://www.facebook.com/JolieSkinCo/" }))!];
    expect(pickRivalPage({ name: "Jolie", website: "jolieskin.co", facebook: "jolieskinco" }, ads)).toEqual({ pageId: "555", pageName: "Jolie Skin Co" });
  });

  it("reads Facebook links off a site and out of URLs", () => {
    expect(facebookRef('<a href="https://www.facebook.com/sharer/sharer.php?u=x">share</a><a href="https://facebook.com/JolieSkinCo">fb</a>')).toBe("JolieSkinCo");
    expect(facebookRef('<a href="https://www.facebook.com/profile.php?id=100064123456">fb</a>')).toBe("100064123456");
    expect(facebookRef('<a href="https://www.facebook.com/people/Afina/100089999999/">fb</a>')).toBe("100089999999");
    expect(facebookRef("<footer>no links</footer>")).toBeNull();
    expect(facebookHandle("https://www.facebook.com/JolieSkinCo/")).toBe("jolieskinco");
    expect(facebookHandle("https://m.facebook.com/profile.php?id=123456")).toBe("123456");
    expect(facebookHandle("https://jolieskin.co")).toBeNull();
  });

  it("finds a Page's id in its facebook.com HTML", () => {
    const html = `<meta property="og:title" content="Jolie &amp; Co" /><meta property="al:android:url" content="fb://page/?id=1234567890" />`;
    expect(pageFromHtml(html)).toEqual({ pageId: "1234567890", pageName: "Jolie & Co" });
    expect(pageFromHtml('{"delegate_page":{"is_business_page_active":true,"id":"222333444"}} fb://profile/999888777')?.pageId).toBe("222333444");
    expect(pageFromHtml("<html>login</html>")).toBeNull();
  });
});

describe("Meta's verification challenge", () => {
  it("finds the one-time path in the 403 page and nothing in a real page", () => {
    const page = `<html><body><script>fetch('/__rd_verify_Q_6hBQReRuLsu29wQ1JSeLeCniLpzoZgnbpj_c_6aef7MFecdg?challenge=3', { method: 'POST' }).finally(() => window.location.reload());</script></body></html>`;
    expect(challengePath(page)).toBe("/__rd_verify_Q_6hBQReRuLsu29wQ1JSeLeCniLpzoZgnbpj_c_6aef7MFecdg?challenge=3");
    expect(challengePath("<html>ad_archive_id</html>")).toBeNull();
  });
});

describe("the pagination doc id in a script bundle", () => {
  it("reads the Relay operation export and ignores other ids", () => {
    const js = `__d("AdLibrarySearchPaginationQuery_facebookRelayOperation",[],(function(t,n,r,o,a,i){a.exports="24922295957467452"}),null); __d("Other_facebookRelayOperation",[],(function(t,n,r,o,a,i){a.exports="11111111111111111"}),null);`;
    expect(docIdFromBundle(js)).toBe("24922295957467452");
    expect(docIdFromBundle(`a.exports="11111111111111111"`)).toBeNull();
  });
});

describe("the session parameters the GraphQL endpoint wants", () => {
  it("reads them off the page and falls back sensibly", () => {
    const html = `"server_revision":1050469598,"haste_session":"20741.HYP:comet_plat_default_pkg.2.1...0","connectionClass":"EXCELLENT","hsi":"7696939723807301248","__spin_r":1050469598,"__spin_b":"trunk","__spin_t":1792083430, jazoest=22507`;
    const p = sessionParams(html);
    expect(p.__rev).toBe("1050469598");
    expect(p.__hs).toBe("20741.HYP:comet_plat_default_pkg.2.1...0");
    expect(p.__hsi).toBe("7696939723807301248");
    expect(p.__spin_t).toBe("1792083430");
    expect(p.jazoest).toBe("22507");
    expect(sessionParams("").__spin_b).toBe("trunk");
  });
});
