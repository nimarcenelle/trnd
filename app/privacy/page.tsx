import LegalShell from "@/components/legal/legal-shell";

export const metadata = { title: "Privacy Policy — TRND" };

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="August 27, 2026">
      <h2>What we collect</h2>
      <p>
        Your account details (name, email, password hash), your business profile (name,
        category, location, services, prices, brand-voice notes, website), campaign results you
        type in, and the campaigns generated for you. If you point TRND at your website during
        setup, we read the public pages you named to prefill your profile — nothing behind a
        login, ever.
      </p>

      <h2>What we do with it</h2>
      <p>
        Run the product: score trends against what you sell, generate campaigns, and track
        your results. Aggregated, de-identified performance patterns (for example, &quot;education
        angles convert well for restaurants in this region&quot;) improve recommendations for
        similar businesses — never in a form that identifies you, your business, or your numbers.
      </p>

      <h2>Who touches it</h2>
      <p>
        Infrastructure and service providers under contract: our database and auth provider
        (Supabase), payments (Stripe — we never see card numbers), and, when configured, a
        model provider (Google Gemini) that receives your business profile to generate your
        campaigns. We do not sell personal data, and we don&apos;t use your data to advertise to
        you elsewhere.
      </p>

      <h2>Trend signal</h2>
      <p>
        Market signals come from public sources (search trends, public forums, public ad
        libraries). They describe markets, not people — TRND holds no consumer profiles and
        does no cross-site tracking. The product itself sets only the cookies it needs to keep
        you signed in and remember your theme.
      </p>

      <h2>Your controls</h2>
      <p>
        Edit your business profile any time in Settings. Export your campaigns from any
        campaign page. Delete your account in Settings — it permanently removes your account,
        business, services, campaigns, and recorded results. For anything else, contact us and
        we&apos;ll sort it out.
      </p>

      <h2>Security &amp; retention</h2>
      <p>
        Passwords are stored hashed, data is encrypted in transit, and per-business row-level
        security keeps one business&apos;s data invisible to every other. We keep your data while
        your account exists and delete it when you do; backups age out on a rolling window.
      </p>
    </LegalShell>
  );
}
