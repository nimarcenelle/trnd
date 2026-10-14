import { IconAd, IconBolt, IconGlobe, IconMail, IconShield, IconTarget } from "@/components/icons";

/**
 * How TRND thinks, as one picture: your business DNA, the three signal
 * streams, the opportunity engine that reads them through your business, and
 * the three ways to compete it recommends.
 */

function Arrow() {
  return (
    <div className="flex justify-center py-2 text-ink-3" aria-hidden="true">
      <svg width="16" height="20" viewBox="0 0 16 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2v15M3 12l5 5 5-5" />
      </svg>
    </div>
  );
}

const STREAMS = [
  { icon: IconMail, title: "Emails", body: "What they send subscribers" },
  { icon: IconGlobe, title: "Websites", body: "Changes in offerings and positioning" },
  { icon: IconAd, title: "Meta ads", body: "Public acquisition campaigns" },
];

const MOVES = [
  { icon: IconBolt, title: "Get ahead", body: "Act before rivals", tone: "text-pos" },
  { icon: IconTarget, title: "Win the choice", body: "Own a stronger angle", tone: "text-brand" },
  { icon: IconShield, title: "Counter", body: "Defend your position", tone: "text-warn" },
];

export default function EngineDiagram() {
  return (
    <figure className="m-0 card p-4 sm:p-6 max-w-[760px] mx-auto">
      <figcaption className="caption mb-3">The TRND intelligence engine</figcaption>

      <div className="well px-5 py-4 text-center">
        <div className="heading text-[17px]">Your business DNA</div>
        <p className="text-[13px] text-ink-2 mt-1 leading-[1.55]">Offerings · Customers · Positioning · Pricing · Market · Goals · Past performance</p>
      </div>

      <Arrow />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {STREAMS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="well px-2 sm:px-4 py-4 text-center flex flex-col items-center">
            <span className="text-ink-2">
              <Icon />
            </span>
            <div className="text-[13.5px] sm:text-[15px] font-semibold mt-2">{title}</div>
            <p className="text-[11.5px] sm:text-[12.5px] text-ink-3 mt-1 leading-[1.45]">{body}</p>
          </div>
        ))}
      </div>

      <Arrow />

      <div className="rounded-[10px] bg-ink text-bg px-5 py-4 text-center">
        <div className="heading text-[17px]">Competitive opportunity engine</div>
        <p className="text-[13px] opacity-75 mt-1 leading-[1.55]">Connect signals · Interpret intent · Weigh your advantage · Prioritize responses</p>
      </div>

      <Arrow />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {MOVES.map(({ icon: Icon, title, body, tone }) => (
          <div key={title} className="rounded-[10px] border border-line px-2 sm:px-4 py-4 text-center flex flex-col items-center">
            <span className={tone}>
              <Icon />
            </span>
            <div className="text-[13.5px] sm:text-[15px] font-semibold mt-2">{title}</div>
            <p className="text-[11.5px] sm:text-[12.5px] text-ink-3 mt-1 leading-[1.45]">{body}</p>
          </div>
        ))}
      </div>
    </figure>
  );
}
