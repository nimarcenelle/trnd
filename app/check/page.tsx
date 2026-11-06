import Onboarding from "@/components/creator/onboarding";
import { cleanSrc } from "@/lib/creator/check";
import { logEvent } from "@/lib/creator/store";

export const metadata = { title: "Why are your posts flopping? — TRND", robots: { index: false } };
// The last step runs the whole read: the profile, the niche and the model.
export const maxDuration = 300;

/** The onboarding. ?platform= and ?handle= (from the landing page's box or a shared result) skip what is already known. */
export default async function CheckPage({ searchParams }: PageProps<"/check">) {
  const q = await searchParams;
  const src = cleanSrc(q.src);
  const platform = q.platform === "instagram" ? "instagram" : q.platform === "tiktok" ? "tiktok" : "";
  const handle = typeof q.handle === "string" ? q.handle.trim().slice(0, 60) : "";
  await logEvent("onboard_start", { src, meta: { prefilled: Boolean(handle) } });
  return <Onboarding initial={{ platform, handle, src }} />;
}
