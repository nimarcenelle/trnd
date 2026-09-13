import type { CampaignStatus } from "@/lib/db/types";

/**
 * How a campaign's status reads on the Campaigns screens: the chip on a
 * card and the group heading on the list, said once here so the list and
 * the detail page agree.
 */

export type StatusTone = "mint" | "amber" | "faint" | null;

const CHIP: Record<CampaignStatus, { label: string; tone: StatusTone }> = {
  draft: { label: "Draft", tone: "amber" },
  exported: { label: "Exported", tone: null },
  live: { label: "Live", tone: "mint" },
  complete: { label: "Done", tone: "faint" },
};

/** The chip's label and `.badge` tone; a tone of null is the plain badge. */
export function statusChip(status: CampaignStatus): { label: string; tone: StatusTone } {
  return CHIP[status];
}

/** The order the groups are listed in: what needs a hand first. */
export const STATUS_ORDER: CampaignStatus[] = ["draft", "live", "exported", "complete"];

export const GROUP_LABEL: Record<CampaignStatus, string> = {
  draft: "Drafts, ready to launch",
  live: "Live",
  exported: "Exported",
  complete: "Done",
};
