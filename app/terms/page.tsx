import LegalShell from "@/components/legal/legal-shell";

export const metadata = { title: "Terms of Service · EssayOdds" };

/** Plain-English terms that match what the product does. Have counsel review before scale. */
export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="November 5, 2026">
      <h2>What EssayOdds is</h2>
      <p>
        EssayOdds estimates your odds at selected colleges from figures those colleges publish, and rates and rewrites your
        application essays using AI models. It is a decision-support tool. Odds are estimates, and essay scores are an AI
        model&apos;s reading against our rubric. Neither predicts or guarantees an admission, and no college is affiliated with
        EssayOdds.
      </p>

      <h2>Subscription and payment</h2>
      <p>
        Essay reviews and rewrites are sold as one-time passes, paid through Stripe: the RD Pass ($59) gives access until
        January 15, 2027, and does not renew. The weekly plan ($19 a week) is a subscription that renews every week until you
        cancel it from your account; you keep access to the end of the week you paid for. Someone else may pay for you.
        Payments are non-refundable, except where the law requires otherwise.
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
      <p>Don&apos;t resell EssayOdds, share your access link publicly, probe or overload the service, or submit writing that isn&apos;t yours to submit.</p>

      <h2>Liability</h2>
      <p>
        EssayOdds is provided as is. To the extent the law allows, our total liability to you is limited to what you paid us, and
        we are not liable for admission decisions or indirect damages.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms and will change the date above when we do.</p>
    </LegalShell>
  );
}
