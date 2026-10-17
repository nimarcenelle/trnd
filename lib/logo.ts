/**
 * Pure: the best icon a homepage declares. Apple touch icons (180px) beat a
 * favicon; otherwise the largest `sizes` wins. Relative hrefs resolve against
 * the page.
 */
export function bestIcon(html: string, base: string): string | null {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const icons = links
    .map((tag) => {
      const rel = tag.match(/\brel=["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? "";
      const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
      if (!href || !/(^|\s)(icon|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/.test(rel)) return null;
      const size = Number(tag.match(/\bsizes=["'](\d+)x\d+["']/i)?.[1] ?? 0);
      const svg = /\.svg(\?|$)/i.test(href) || /image\/svg/i.test(tag);
      // Rank: touch icons first (they're large and opaque), then by size; an SVG scales, so it ranks high too.
      const rank = (rel.includes("apple-touch-icon") ? 1000 : 0) + (svg ? 500 : 0) + size;
      try {
        return { url: new URL(href.replace(/&amp;/g, "&"), base).toString(), rank };
      } catch {
        return null;
      }
    })
    .filter((x): x is { url: string; rank: number } => x !== null && /^https:\/\//.test(x.url))
    .sort((a, b) => b.rank - a.rank);
  return icons[0]?.url ?? null;
}
