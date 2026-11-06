import LegalShell from "@/components/legal/legal-shell";

export const metadata = { title: "Terms of Service — TRND for creators" };

/** Plain-English terms that match what the product does. Have counsel review before scale. */
export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="October 30, 2026">
      <h2>What TRND for creators is</h2>
      <p>
        TRND reads your public TikTok videos, the public videos of creators in your niche and the hashtags you post in, and writes
        a weekly plan: ideas for videos to make, with scripts. It is a planning tool. You make and post your own videos, on your
        own account.
      </p>

      <h2>Your account</h2>
      <p>
        You sign in with Google or a code we email you; keep access to that email to yourself. Only track a TikTok account that is yours or
        that you are authorized to manage. One TikTok account per TRND account.
      </p>

      <h2>Plans and billing</h2>
      <p>
        The Free plan needs no card: your numbers, the creators ahead of you, what&apos;s rising, and one scripted idea a week. The
        Creator plan ($19 a month or $149 a year) is billed through Stripe until you cancel. Cancel any time from Settings; you keep
        access until the end of the period you paid for. If a paid plan isn&apos;t for you, email us within 14 days of the first charge
        for a full refund. If a payment fails, the plan keeps running while Stripe retries; if it can&apos;t be collected, the account
        goes back to Free and what TRND already found stays readable. Pro and Business are not on sale yet. One-time add-ons (a script
        pack, a done-for-you month) are delivered by email within 3 business days and refunded in full if we can&apos;t deliver.
      </p>

      <h2>Public data and generated plans</h2>
      <p>
        Other creators&apos; videos belong to them. TRND shows their public numbers so you can learn what works in your niche; it
        gives you no rights in their videos. Make your own version, never a copy of someone else&apos;s video, voice, likeness,
        music or words. Plans are written by an AI model from public numbers. They can be wrong, and a video beating its usual
        views is evidence, not proof, that a format works.
      </p>

      <h2>What you may not do</h2>
      <p>
        Don&apos;t resell or republish TRND&apos;s data in bulk, probe or overload the service, access another customer&apos;s
        data, harass the creators you follow, or use TRND to break the law or TikTok&apos;s terms.
      </p>

      <h2>Liability</h2>
      <p>
        TRND is provided as is. To the extent the law allows, our total liability to you is limited to what you paid us in the
        three months before the claim, and we are not liable for lost earnings, deals or indirect damages.
      </p>

      <h2>Ending things</h2>
      <p>
        You can cancel, and delete your account from Settings, at any time. We may suspend accounts that break these terms. We&apos;ll
        tell you by email before any material change to these terms takes effect.
      </p>
    </LegalShell>
  );
}
