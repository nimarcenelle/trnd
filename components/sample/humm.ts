import "server-only";

import type { IdeaSource } from "@/components/app/idea-card";
import { normalOf, timesNormal } from "@/lib/creators/stats";
import { asVideo } from "@/lib/preview/run";
import type { Preview } from "@/lib/preview/types";

import snapshot from "./humm-preview.json";

/**
 * The landing page's example: a real free preview of @humm.app, snapshotted by
 * scripts/snapshot-sample.mjs (never fetched live). Everything here is computed
 * the way /start/[id] computes it, so the example is exactly what a visitor sees.
 */
export const SAMPLE = snapshot as unknown as Preview & { plan: NonNullable<Preview["plan"]> };

export const SAMPLE_OWN = SAMPLE.videos.map((v) => asVideo(v, SAMPLE.handle));
export const SAMPLE_NORMAL = normalOf(SAMPLE_OWN);
export const SAMPLE_BEST = SAMPLE_OWN.map((v) => timesNormal(v.views, SAMPLE_NORMAL) ?? 0).sort((a, b) => b - a)[0] ?? null;
export const SAMPLE_IDEA = SAMPLE.plan.ideas[0];

const sampleVideos = SAMPLE.sample.map((v) => asVideo(v, SAMPLE.handle));
const src = SAMPLE_IDEA.source_video ? ([...SAMPLE_OWN, ...sampleVideos].find((v) => v.video_id === SAMPLE_IDEA.source_video) ?? null) : null;
const srcNormal = src ? normalOf(src.is_self ? SAMPLE_OWN : sampleVideos.filter((v) => v.author === src.author)) : null;

export const SAMPLE_SOURCE: IdeaSource = {
  video: src,
  own: Boolean(src?.is_self),
  times: src && srcNormal ? timesNormal(src.views, srcNormal) : null,
  borrow: null,
  trend: SAMPLE_IDEA.source_trend ? (SAMPLE.trends.find((t) => t.key === SAMPLE_IDEA.source_trend) ?? null) : null,
};
