import LegalShell from "@/components/legal/legal-shell";

export const metadata = { title: "Terms of Service — TRND" };

/**
 * Written to be read: plain-English terms that match what the product
 * actually does. Not a substitute for counsel review before scale — but
 * honest, specific, and enforceable-in-spirit from day one.
 */
export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="August 27, 2026">
      <h2>What TRND is</h2>
      <p>
        TRND recommends what a business should advertise each week, generates the campaign
        assets, and tracks the results you record. It is a decision-support and content tool —
        you run the ads on your own ad accounts, with your own budgets.
      </p>

      <h2>Your account</h2>
      <p>
        You need an account to use the product. Keep your password to yourself and tell us if
        you think someone else has it. You must be authorized to act for the business you
        register. One business per account today.
      </p>

      <h2>Plans, trials, and billing</h2>
      <p>
        Every new business starts a 14-day free trial — full product, no card required. Paid
        plans are billed monthly through Stripe and you can cancel anytime from the billing
        portal; cancellation stops future charges and your plan runs to the end of the paid
        period. Founding-business pricing stays locked while your subscription is continuous.
        The campaigns you generated are yours — export them any time, on any plan or none.
      </p>

      <h2>What you may not do</h2>
      <p>
        Don&apos;t resell access, scrape the service, probe other businesses&apos; data, or use
        generated content to mislead — no fake reviews, impersonation, or claims your business
        can&apos;t honor. Ad platforms have their own policies; what you publish there is your
        responsibility.
      </p>

      <h2>Signals, scores, and generated content</h2>
      <p>
        Trend signals, scores, grades, and benchmarks are estimates, clearly labeled when
        illustrative. They are not guarantees of demand or ad performance. Generated copy is a
        draft for your judgment — review it before you spend money on it. You own the campaign
        content generated for your business; we may use aggregated, de-identified performance
        patterns to make recommendations sharper for everyone.
      </p>

      <h2>Liability</h2>
      <p>
        The service is provided as-is. To the maximum extent the law allows, our total
        liability for any claim is capped at what you paid us in the twelve months before the
        claim. We are not liable for ad spend outcomes, platform account actions, or indirect
        damages.
      </p>

      <h2>Ending things</h2>
      <p>
        You can delete your account in Settings at any time — it removes your business data
        permanently. We may suspend accounts that break these terms, with notice where
        practical. We can update these terms; material changes will be announced in the product
        before they take effect.
      </p>
    </LegalShell>
  );
}
