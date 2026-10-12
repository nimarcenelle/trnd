import { describe, expect, it } from "vitest";

import { domainOf, nameCore, pickRivalPage, sameName } from "@/lib/adlibrary/match";
import { graphqlBlocks, jsonBlocks, looksBlocked, pageTokens, parsePayloads, toScrapedAd } from "@/lib/adlibrary/parse";
import { libraryUrl } from "@/lib/adlibrary/scrape";

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
