import LegalShell from "@/components/legal/legal-shell";

export const metadata = { title: "Terms of Service — TRND" };

/** Plain-English terms that match what the product does. Have counsel review before scale. */
export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="October 12, 2026">
      <h2>What TRND is</h2>
      <p>
        TRND reads your website, names the competitors running Meta ads to your customers, reads their active ads from Meta&apos;s
        public Ad Library every day, and writes reports on what they run and what changed. It is a research and decision-support
        tool. You make and run your own ads, on your own accounts, with your own budgets.
      </p>

      <h2>Your account</h2>
      <p>
        Keep your password to yourself and tell us if you think someone else has it. You must be authorized to act for the
        business you register. One business per account.
      </p>

      <h2>Trial and billing</h2>
      <p>
        Every account starts with a 14-day free trial. After that, TRND is a monthly subscription billed through Stripe until you
        cancel. Cancel any time from Settings; you keep access until the end of the period you paid for. When a trial ends without
        a plan, daily scans pause and what TRND already found stays readable.
      </p>

      <h2>Public ad data and generated reports</h2>
      <p>
        Competitor ads come from Meta&apos;s public Ad Library and belong to the advertisers who ran them. TRND shows them so you
        can study the market; it gives you no rights in them. Use what you learn to make your own ads, not to copy someone
        else&apos;s creative, trademarks or claims. Reports are written by an AI model from that public data. They can be wrong,
        and how long an ad has run is evidence, not proof, that it works. Check before you spend.
      </p>

      <h2>What you may not do</h2>
      <p>
        Don&apos;t resell or republish TRND&apos;s data in bulk, probe or overload the service, access another customer&apos;s
        data, or use TRND to break the law or another platform&apos;s terms.
      </p>

      <h2>Liability</h2>
      <p>
        TRND is provided as is. To the extent the law allows, our total liability to you is limited to what you paid us in the
        three months before the claim, and we are not liable for lost profits, ad spend, or indirect damages.
      </p>

      <h2>Ending things</h2>
      <p>
        You can cancel and ask us to delete your account at any time. We may suspend accounts that break these terms. We&apos;ll
        tell you by email before any material change to these terms takes effect.
      </p>
    </LegalShell>
  );
}
