import { sentenceCase } from "@/lib/text";

import { paragraph, renderEmail } from "./layout";

/**
 * The one line an owner gets when their first picks land. The first week's
 * picks take minutes to write, and nobody waits on a screen for minutes.
 */

export function firstPicksSubject(count: number): string {
  return count === 1 ? "Your first pick is ready" : `Your first ${count} picks are ready`;
}

export function renderFirstPicksEmail(opts: { businessName: string; count: number; url: string }): string {
  const { businessName, count, url } = opts;
  const one = count === 1;
  const name = sentenceCase(businessName);
  return renderEmail({
    preheader: `TRND finished reading ${name}. This week's ${one ? "pick is" : "picks are"} written.`,
    title: firstPicksSubject(count),
    intro: `TRND finished reading ${name}'s customers, category and competitors.`,
    body: paragraph(
      one
        ? "This week's pick is written: the ad to run next, with the demand behind it and the copy to shoot it with."
        : `This week's ${count} picks are written and ranked: the ad to run next comes first, each with the demand behind it and the copy to shoot it with.`,
    ),
    cta: { label: one ? "See the ad to run next" : "See this week's picks", url },
    footnote: "A new set arrives every Monday.",
  });
}
