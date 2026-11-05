import LegalShell from "@/components/legal/legal-shell";

export const metadata = { title: "Terms of Service · Admitted" };

/** Plain-English terms that match what the product does. Have counsel review before scale. */
export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="November 4, 2026">
      <h2>What Admitted is</h2>
      <p>
        Admitted estimates your odds at selected colleges from figures those colleges publish, and reviews and rewrites your
        application essays using AI models. It is a decision-support tool. Odds are estimates, and essay scores are an AI
        model&apos;s reading against our rubric. Neither predicts or guarantees an admission, and no college is affiliated with
        Admitted.
      </p>

      <h2>Who can buy</h2>
      <p>If you are under 18, a parent or guardian must make the purchase and agree to these terms.</p>

      <h2>Payment and refunds</h2>
      <p>
        Essay review and rewrites cost one payment for the application cycle, billed through Stripe. It is not a subscription. If
        it isn&apos;t for you, email us within 14 days of paying for a full refund.
      </p>

      <h2>Your access</h2>
      <p>
        There is no account. Your purchase is tied to an access link, which we show you after you pay. Keep it private, because
        anyone who has it can use your access. Daily limits may apply so the service stays available to everyone.
      </p>

      <h2>Your essays</h2>
      <p>
        Your essays stay yours. Reviews and rewrites work only from what you submit, but AI models can make mistakes, so read
        everything before you use it and make sure every statement is true. You are responsible for what you submit to a college
        and for following its rules on outside help and AI.
      </p>

      <h2>What you may not do</h2>
      <p>Don&apos;t resell Admitted, share your access link publicly, probe or overload the service, or submit writing that isn&apos;t yours to submit.</p>

      <h2>Liability</h2>
      <p>
        Admitted is provided as is. To the extent the law allows, our total liability to you is limited to what you paid us, and
        we are not liable for admission decisions or indirect damages.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms and will change the date above when we do.</p>
    </LegalShell>
  );
}
