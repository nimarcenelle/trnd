import "server-only";

import { adminSupabase } from "@/lib/db/supabase";
import type { Creator } from "@/lib/db/types";
import { env } from "@/lib/env";

/**
 * Referrals: one free month for the referrer and the referee. A creator's
 * link is /join/<code>; the cookie it sets is read when the account is made
 * (lib/creators/create.ts). The referee's free month is a 30-day trial on
 * their first checkout; the referrer's is a credit (creators.free_months),
 * used as a 30-day trial on their next checkout, or, when they already pay
 * and STRIPE_COUPON_FREE_MONTH is set, a 100%-off month on their subscription.
 */

export const REF_COOKIE = "trnd_ref";
export const FREE_MONTH_DAYS = 30;

const CHARS = "abcdefghijkmnpqrstuvwxyz23456789";
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => CHARS[b % CHARS.length]).join("");
export const isCode = (v: string) => /^[a-z0-9]{6,12}$/.test(v);

export const referralUrl = (code: string) => `${env.siteUrl}/join/${code}`;

/** The creator's code, made the first time it's needed. */
export async function referralCode(c: Pick<Creator, "id" | "referral_code">): Promise<string> {
  if (c.referral_code) return c.referral_code;
  const sb = adminSupabase();
  for (let i = 0; i < 4; i++) {
    const code = newCode();
    const { error } = await sb.from("creators").update({ referral_code: code }).eq("id", c.id).is("referral_code", null);
    if (!error) {
      const { data } = await sb.from("creators").select("referral_code").eq("id", c.id).maybeSingle<{ referral_code: string | null }>();
      if (data?.referral_code) return data.referral_code;
    }
  }
  throw new Error("Couldn't make a referral code");
}

/** The free month a checkout carries, and why: the referee's own, or a credit the creator earned. */
export function freeMonthFor(c: Pick<Creator, "referred_by" | "referral_rewarded_at" | "free_months" | "trial_used_at">): "referee" | "credit" | null {
  if (c.referred_by && !c.referral_rewarded_at && !c.trial_used_at) return "referee";
  if ((c.free_months ?? 0) > 0) return "credit";
  return null;
}
