import LegalShell from "@/components/legal/legal-shell";

export const metadata = { title: "Terms of Service · EssayOdds" };

/** Plain-English terms that match what the product does. Have counsel review before scale. */
export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="November 19, 2026">
      <h2>What EssayOdds is</h2>
      <p>
        EssayOdds estimates your odds at selected colleges from figures those colleges publish, and rates and rewrites your
        application essays using AI models. It is a decision-support tool. Odds are estimates, and essay scores are an AI
        model&apos;s reading against our rubric. Neither predicts or guarantees an admission, and no college is affiliated with
        EssayOdds.
      </p>

      <h2>Passes and payment</h2>
      <p>
        Payment is taken through Stripe. The RD Pass ($59) is one payment and does not renew: it gives access until the end of
        January 15, 2027, or for seven days from purchase if that is later. Pro ($199) is the same pass plus one 45-minute call,
        booked online, and runs for the same period. The weekly plan ($19 a week) is a subscription that renews every week
        until you cancel it from your account; you keep access to the end of the week you paid for. If you buy a pass while on
        the weekly plan, we cancel the weekly plan so you are not charged for both. Someone else may pay for you. Payments are
        non-refundable, except where the law requires otherwise; if a payment is refunded or disputed, the access it bought
        ends.
      </p>

      <h2>Your access</h2>
      <p>
        Your purchase is tied to an access link, which we show you after you pay and email to the address you paid with. Keep
        it private, because anyone who has it can use your access. You can also create an account with your email (we send a
        code, there is no password) so your pass and saved work follow you to any device. Daily limits apply so the service
        stays available to everyone.
      </p>

      <h2>Who can use EssayOdds</h2>
      <p>
        EssayOdds is for students applying to college and the people helping them. If you are under 18, use it with the
        permission of a parent or guardian, who must agree to these terms and make any purchase for you. EssayOdds is not for
        children under 13.
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
