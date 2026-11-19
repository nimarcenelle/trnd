import LegalShell from "@/components/legal/legal-shell";

export const metadata = { title: "Privacy Policy · EssayOdds" };

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="November 19, 2026">
      <h2>What we collect</h2>
      <p>
        The GPA, test score, home state and schools you enter for odds, and the essay you add there. If you buy a pass, the
        essays, prompts, activity lists and score reports you submit. If you create an account, your email. If you request a
        school, that school and your email, used only to tell you when it opens. Stripe handles payment and collects your email
        and card details; we never see your card number. Files you upload are read to fill in your answers and are not kept.
      </p>

      <h2>How your essays are stored</h2>
      <p>
        Reviews and rewrites are saved encrypted, with a key held only by EssayOdds, under a fingerprint of the draft so the
        same draft gets the same result. Reviews quote lines from your draft and rewrites contain your text. If you are signed
        in, your current drafts, lists and odds answers are also saved, encrypted the same way, so you can pick them up on
        another device. Without an account, drafts stay in your browser. Everything sits in a database operated by TRND,
        EssayOdds&apos;s parent product, and is unreadable without the key.
      </p>

      <h2>Who else handles it</h2>
      <p>
        OpenAI receives your essays to review and rewrite them, and it does not train on API data. Supabase hosts our database,
        Stripe handles payment, Resend delivers our emails (your access link and sign-in codes) and Vercel hosts the site. If
        you book a Pro call, the booking service receives your name and email. We don&apos;t sell your data.
      </p>

      <h2>Cookies</h2>
      <p>A cookie that remembers your pass, a cookie that keeps you signed in if you have an account, and a local setting for light or dark mode.</p>

      <h2>Your controls</h2>
      <p>To get a copy of your saved results or have them deleted, email us with your access link or account email and we&apos;ll do it within 30 days.</p>

      <h2>Students</h2>
      <p>
        EssayOdds is for students applying to college and isn&apos;t directed at children under 13. If you are under 18, use it
        with a parent or guardian&apos;s permission. A parent or guardian can ask us to delete a student&apos;s saved work at any time.
      </p>

      <h2>Changes</h2>
      <p>We may update this policy and will change the date above when we do.</p>
    </LegalShell>
  );
}
