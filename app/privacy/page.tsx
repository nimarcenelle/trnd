import LegalShell from "@/components/legal/legal-shell";

export const metadata = { title: "Privacy Policy — TRND for creators" };

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="October 19, 2026">
      <h2>What we collect</h2>
      <p>
        Your email and password (handled by our auth provider, Supabase), your TikTok handle, your goals, the creators you follow
        in TRND, and billing details (handled by Stripe; we never see your card number).
      </p>

      <h2>What we read from public sources</h2>
      <p>
        Your public TikTok profile and videos; the public profiles and videos of creators in your niche; and public videos under
        the hashtags you post in. For each video: its caption, hashtags, sound, length, date and its public views, likes, comments,
        shares and saves. We keep a daily copy of those numbers so we can show change over time.
      </p>

      <h2>If you connect TikTok</h2>
      <p>
        Connecting is optional. With your permission, TikTok gives us your basic profile, your follower and like counts and your
        recent videos&apos; counts. We store the access tokens on our servers only, use them only to read those numbers for you,
        and delete them when you disconnect or delete your account. You can also revoke access in TikTok&apos;s settings.
      </p>

      <h2>Who we share it with</h2>
      <p>
        Supabase stores your account and data. Apify reads public TikTok pages for us. OpenAI receives your public videos&apos;
        captions and numbers, and your goals, to write your plan; it does not train on API data. Stripe handles billing, Resend
        sends our emails, and Vercel hosts the app. We don&apos;t sell your data or show you ads.
      </p>

      <h2>Emails</h2>
      <p>Account emails (confirmations, password resets) and your weekly plan.</p>

      <h2>Your choices</h2>
      <p>
        Change your handle, goals and the creators you follow any time in Settings. To get a copy of your data or have your
        account deleted, email hello@usetrnd.com.
      </p>
    </LegalShell>
  );
}
