import LegalShell from "@/components/legal/legal-shell";

export const metadata = { title: "Terms of Service — TRND" };

/**
 * Written to be read: plain-English terms that match what the product
 * actually does. Not a substitute for counsel review before scale — but
 * honest, specific, and enforceable-in-spirit from day one.
 */
export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="September 12, 2026">
      <h2>What TRND is</h2>
      <p>
        TRND writes weekly creative test briefs for a brand: each a hypothesis with the evidence
        behind it, in a brief a creator can shoot from, and tracks the results you record or
        that sync from your own ad account. It is a decision-support and content tool — you make
        the ads and run them on your own ad accounts, with your own budgets.
      </p>

      <h2>Your account</h2>
      <p>
        You need an account to use the product. Keep your password to yourself and tell us if
        you think someone else has it. You must be authorized to act for the business you
        register. One business per account today.
      </p>

      <h2>Plans, trials, and billing</h2>
      <p>
        During the founder-assisted pilot, access is by invitation and the pilot is a one-month
        engagement at the price stated when you were accepted. An account created with an invite
        starts with a 14-day trial period and no card on file; nothing is charged through the app
        unless you choose a paid plan. Paid plans are billed monthly through Stripe and you can
        cancel anytime from the billing portal; cancellation stops future charges and your plan
        runs to the end of the paid period. Founding-brand pricing stays locked while your
        subscription is continuous. The briefs TRND wrote for you are yours; export them any
        time, on any plan or none.
      </p>

      <h2>Connected ad accounts</h2>
      <p>
        If you connect an ad account, such as Meta, you confirm you have the right to give TRND
        access to it. TRND only reads your account&apos;s ad history and results; it never creates,
        changes or spends on a campaign. Your spend is billed by the ad platform, not by us, and
        that platform&apos;s own terms and ad policies apply. You can disconnect any time in
        Settings. See our <a className="text-amber" href="/privacy">Privacy Policy</a> for what
        we store and how Google API data is handled.
      </p>

      <h2>YouTube</h2>
      <p>
        TRND uses YouTube API Services to show short-form video trends. By using TRND, you agree
        to be bound by the{" "}
        <a className="text-amber" href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">
          YouTube Terms of Service
        </a>
        . How Google handles data is covered by the{" "}
        <a className="text-amber" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
          Google Privacy Policy
        </a>
        , and what TRND does with YouTube data is in our{" "}
        <a className="text-amber" href="/privacy">Privacy Policy</a>.
      </p>

      <h2>Your content</h2>
      <p>
        You keep ownership of the website details, documents, and notes you give us. You let us
        use them only to run TRND for you, and you confirm you have the right to share them.
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
        Trend signals and benchmarks are estimates, clearly labeled when illustrative. They are
        not guarantees of demand or ad performance. A brief is a hypothesis for your judgment —
        review it before you spend money on it. You own the briefs written for your business; we
        may use aggregated, de-identified performance patterns to make briefs sharper for
        everyone.
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
