import Link from "next/link";

import SubmitButton from "@/components/app/submit-button";
import type { Alert } from "@/lib/db/types";
import { markAlertsReadAction } from "@/lib/intel/actions";

/** What changed since they last looked. One line, above everything: it is
 * the only thing on the screen that is news. */
export default function AlertBar({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null;
  return (
    <form action={markAlertsReadAction} className="alertbar">
      <span className="alertbar__dot" aria-hidden="true" />
      <p className="alertbar__text">
        <Link href={alerts[0].href}>{alerts[0].title}</Link>
        {alerts.length > 1 && (
          <span className="alertbar__more"> · {alerts.length - 1} more alert{alerts.length === 2 ? "" : "s"}</span>
        )}
      </p>
      <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="…">
        Mark read
      </SubmitButton>
    </form>
  );
}
