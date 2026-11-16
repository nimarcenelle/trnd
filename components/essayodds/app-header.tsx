import Link from "next/link";

import Brand from "@/components/brand";
import ThemeToggle from "@/components/theme-toggle";
import { paidAccess } from "@/lib/essayodds/access";
import { currentSession } from "@/lib/essayodds/auth";

import AccountMenu from "./account-menu";
import ToolTabs from "./tool-tabs";

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

/**
 * The bar on every tool page (Essays, Activities, Final Read): the brand, the four tools as one control with the current
 * one raised, and on the right what the student has (a pass and until when, or a way to get one) and their account.
 */
export default async function AppHeader({ welcome = false }: { welcome?: boolean }) {
  const [access, account] = await Promise.all([paidAccess(), currentSession()]);
  const until = access?.until ? day(access.until) : null;
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ground/90 backdrop-blur-md">
      <div className="h-16 px-4 sm:px-6 grid grid-cols-[auto_1fr_auto] items-center gap-4">
        <Brand />
        <div className="hidden md:flex justify-center">
          <ToolTabs />
        </div>
        <div className="flex items-center gap-2 justify-end col-start-3">
          <ThemeToggle />
          {access && (
            <span className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-pos-bg text-[12.5px] font-medium text-[var(--pos)] tnum">
              <i className="w-1.5 h-1.5 rounded-full bg-[var(--pos)]" />
              {until ? `Pass until ${until}` : "Weekly plan"}
            </span>
          )}
          <AccountMenu email={account?.email ?? null} hasPass={Boolean(access)} until={access?.until ? access.until.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/New_York" }) : null} buyerEmail={account ? null : (access?.email ?? null)} welcome={welcome} manageId={access?.recurring ? access.id : null} />
          {!access && (
            <Link href="/pricing" className="btn btn-primary btn-sm">
              Get a pass
            </Link>
          )}
        </div>
      </div>
      <div className="md:hidden px-4 pb-2.5 -mt-1">
        <ToolTabs className="w-full" />
      </div>
    </header>
  );
}
