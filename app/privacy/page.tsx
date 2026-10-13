import LegalShell from "@/components/legal/legal-shell";

export const metadata = { title: "Privacy Policy — TRND" };

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="October 12, 2026">
      <h2>What we collect</h2>
      <p>
        Your email and password (handled by our auth provider, Supabase), your website address, the competitors you watch, and
        billing details (handled by Stripe; we never see your card number).
      </p>

      <h2>What we read from public sources</h2>
      <p>
        Your public website, to say what you sell and who you compete with, and the active ads of the competitors you watch, from
        Meta&apos;s public Ad Library. Nothing is watched until you confirm the competitor list.
      </p>

      <h2>Who else handles it</h2>
      <p>
        Supabase stores your account and data. OpenAI receives your website text and your competitors&apos; public ads to name
        competitors and write reports; it does not train on API data. Stripe handles billing, Resend sends our emails, and Vercel
        hosts the app. If Meta blocks our direct read, Apify may fetch the same public Ad Library pages for us. We don&apos;t sell
        your data.
      </p>

      <h2>Emails</h2>
      <p>Account emails (confirmations, password resets) and an email when your competitors&apos; ads change.</p>

      <h2>Cookies</h2>
      <p>Only the cookies that keep you signed in, and a local setting for light or dark mode.</p>

      <h2>Your controls</h2>
      <p>
        Change the competitors you watch any time in Settings. To get a copy of your data or have your account deleted, email
        us and we&apos;ll do it within 30 days.
      </p>

      <h2>Security &amp; retention</h2>
      <p>
        Data is encrypted in transit and at rest, and each account can read only its own rows. We keep your data while your
        account is open and delete it within 30 days of a deletion request.
      </p>

      <h2>Changes</h2>
      <p>We&apos;ll email you before any material change to this policy.</p>
    </LegalShell>
  );
}
