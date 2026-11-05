import LegalShell from "@/components/legal/legal-shell";

export const metadata = { title: "Privacy Policy · Admitted" };

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="November 4, 2026">
      <h2>What we collect</h2>
      <p>
        The GPA, test score and schools you enter for odds, without an account or your name. If you buy essay review, the essays
        and prompts you submit. Stripe handles payment and collects your email and card details; we never see your card number.
      </p>

      <h2>How your essays are stored</h2>
      <p>
        We don&apos;t save your draft as you typed it. We save a fingerprint of it, so the same draft gets the same result, and
        the review and rewrite we produced, encrypted with a key held only by Admitted. Reviews quote lines from your draft and
        rewrites contain your text. They sit in a database operated by TRND, Admitted&apos;s parent product, and are unreadable
        without that key.
      </p>

      <h2>Who else handles it</h2>
      <p>
        OpenAI receives your essays to review and rewrite them, and it does not train on API data. Supabase hosts our database,
        Stripe handles payment and Vercel hosts the site. We don&apos;t sell your data.
      </p>

      <h2>Cookies</h2>
      <p>A cookie that remembers your purchase, and a local setting for light or dark mode.</p>

      <h2>Your controls</h2>
      <p>To get a copy of your saved results or have them deleted, email us with your access link and we&apos;ll do it within 30 days.</p>

      <h2>Students</h2>
      <p>Admitted is for students applying to college and isn&apos;t directed at children under 13.</p>

      <h2>Changes</h2>
      <p>We may update this policy and will change the date above when we do.</p>
    </LegalShell>
  );
}
