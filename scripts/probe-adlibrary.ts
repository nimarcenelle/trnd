// Diagnostic: capture the Ad Library page as htmlToText lines to design the parser.
import { getRenderer } from "../lib/import/render";
import { htmlToText } from "../lib/import/website";

async function main() {
  const r = await getRenderer();
  if (!r) throw new Error("no renderer");
  const url =
    "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q=med%20spa%20atlanta&search_type=keyword_unordered&media_type=all";
  const html = await r.render(url);
  await r.close();
  if (!html) throw new Error("render failed");
  const text = htmlToText(html);
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /results?/.test(l));
  console.log(lines.slice(Math.max(0, start - 2), start + 60).join("\n"));
}
void main();