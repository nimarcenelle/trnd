import LegalShell from "@/components/legal/legal-shell";

export const metadata = { title: "Privacy Policy — TRND" };

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="September 12, 2026">
      <p>
        TRND (usetrnd.com) tells local businesses what to advertise each week and writes the ads.
        This policy covers what we collect to do that, what we do with it, and how to get it
        removed.
      </p>

      <h2>What we collect</h2>
      <p>
        <strong>Your account:</strong> name, email, and a hashed password.
      </p>
      <p>
        <strong>Your business:</strong> name, category, location, services, prices, brand-voice
        notes, website, the competitors you name, results you type in, and the campaigns and
        reports generated for you. If you give us your website during setup, we read its public
        pages and the menu or price files they link to so we can fill in your profile. We never
        read anything behind a login.
      </p>
      <p>
        <strong>Documents you upload:</strong> menus, price lists, and similar files. We pull the
        text out once and throw the original file away. Only the text and a short summary are
        kept.
      </p>
      <p>
        <strong>Billing:</strong> Stripe handles payment. We see your plan and subscription
        status. We never see card numbers.
      </p>

      <h2>Connected ad accounts</h2>
      <p>
        You can connect an ad account, such as Meta (Facebook and Instagram) or Google Ads, so
        TRND can read how your campaigns are doing and, when you ask it to, create campaigns for
        you. When you connect, the platform shows you exactly what access TRND is asking for. We
        store the access token it gives us, your ad account ID and name, and the campaign numbers
        we sync (spend, impressions, clicks, conversions). We use that access only to show your
        results, sharpen your recommendations, and take ad actions you start yourself. We never
        change your budgets or campaigns without you, and we don&apos;t read personal messages,
        friends lists, or customer lists.
      </p>
      <p>
        You can disconnect any time in Settings, which deletes the stored token. You can also
        revoke access from the platform&apos;s own settings. Deleting your account deletes
        everything we synced.
      </p>
      <p>
        <strong>Google user data.</strong> TRND&apos;s use of information received from Google
        APIs follows the{" "}
        <a
          className="text-amber"
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. Data from Google Ads is used only to provide and
        improve the features you see in TRND. We don&apos;t sell it, use it for advertising, or
        let people read it, except with your permission, for security, or when the law requires
        it. It is never used to train general-purpose AI models.
      </p>

      <h2>What we do with it</h2>
      <p>
        We use your data to run TRND: match what&apos;s trending to what you sell, write your
        campaigns, send your weekly report, and track results. We may also use combined,
        anonymous patterns (for example, &quot;how-to angles do well for restaurants in this
        region&quot;) to improve recommendations for similar businesses. Those patterns never
        identify you, your business, or your numbers.
      </p>

      <h2>Who else handles it</h2>
      <p>
        Only companies that help us run TRND, under contract: Vercel (hosting), Supabase
        (database and sign-in), Stripe (payments), Resend (email), and Google Gemini, which
        receives your business profile and uploaded text to write your campaigns. Our paid data
        providers get search terms and places, never your account details. We do not sell
        personal data, and we don&apos;t use your data to target you with ads anywhere else.
      </p>

      <h2>Market data from public sources</h2>
      <p>
        Trend data comes from public sources: search trends, search volume, public social posts,
        public forums, public ad libraries, and Google Places ratings and reviews for your
        business and the competitors you name. It describes markets, not people. We don&apos;t
        build profiles of consumers or track anyone across sites. Review quotes are shown as
        Google returns them, with the reviewer&apos;s public display name.
      </p>

      <h2>Emails we send</h2>
      <p>
        Customers get a weekly report and alerts, which you can turn off in Settings. We
        occasionally email local businesses one at a time, using contact details from their
        public website or business listing, to offer a free demand snapshot. If you get one of
        those emails, reply &quot;no thanks&quot; and you won&apos;t hear from us again. Ask us
        and we&apos;ll delete your record.
      </p>

      <h2>Cookies</h2>
      <p>
        We only use the cookies needed to keep you signed in. Your light or dark theme is saved
        in your browser. There are no ad or analytics trackers.
      </p>

      <h2>Your controls</h2>
      <p>
        Edit your business profile and documents any time in Settings. Export campaigns from any
        campaign page. Deleting your account in Settings permanently removes your account,
        business, services, documents, connected accounts, campaigns, and results. For access,
        correction, or deletion requests, contact us below and we&apos;ll respond within 30
        days.
      </p>

      <h2>Security &amp; retention</h2>
      <p>
        Passwords are hashed and data is encrypted in transit. Each business&apos;s data is
        locked off from every other business at the database level. We keep your data while
        your account is open and delete it when you close it. Backups are cleared on a rolling
        schedule.
      </p>

      <h2>Children</h2>
      <p>TRND is a business tool and isn&apos;t meant for anyone under 18.</p>

      <h2>Changes</h2>
      <p>
        If we change this policy in a way that matters, we&apos;ll tell you in the app or by
        email before the change takes effect. The date at the top shows the latest version.
      </p>
    </LegalShell>
  );
}
