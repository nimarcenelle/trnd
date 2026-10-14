import type { Rival } from "@/lib/db/types";

const STATUS = {
  receiving: { label: "Receiving", cls: "badge badge-pos" },
  subscribed: { label: "Signed up", cls: "badge badge-info" },
  manual: { label: "Needs you", cls: "badge badge-warn" },
} as const;

/** The rival's TRND inbox: its address, whether it's signed up, and what to do if it isn't. */
export default function InboxCard({ rival, address, configured }: { rival: Rival; address: string | null; configured: boolean }) {
  const status = rival.email_status ? STATUS[rival.email_status] : null;
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-semibold">Their marketing emails</h3>
        {status && <span className={status.cls}>{status.label}</span>}
      </div>
      {!configured ? (
        <p className="text-[13px] text-ink-2 mt-1.5 leading-[1.55]">
          Email tracking needs an inbound mail domain. Set <code>INBOUND_DOMAIN</code> and <code>INBOUND_SECRET</code> (see the README) and every rival gets its own address.
        </p>
      ) : !address ? (
        <p className="text-[13px] text-ink-2 mt-1.5 leading-[1.55]">Their address is created on the next scan, and we try to sign it up to their newsletter.</p>
      ) : (
        <>
          <p className="text-[13px] text-ink-2 mt-1.5 leading-[1.55]">
            {rival.email_status === "receiving"
              ? "Their emails arrive here and are read with every scan."
              : rival.email_status === "subscribed"
                ? "We signed this address up to their newsletter. Their emails show up here when the first one arrives."
                : rival.email_status === "manual"
                  ? `${rival.email_note ?? "We couldn't sign up automatically."} Sign this address up on their site (footer or popup) and their emails arrive here.`
                  : "We try to sign this address up to their newsletter on the next scan."}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="input !h-9 flex items-center text-[13px] font-mono flex-1 min-w-0 truncate select-all">{address}</code>
          </div>
        </>
      )}
    </div>
  );
}
