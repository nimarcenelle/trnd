import { IconCheck } from "@/components/icons";

/** One plan, priced, with what it includes. The action (a link or a form) goes in `cta`. */
export default function PlanCard({
  name,
  price,
  per = "per month",
  blurb,
  features,
  note,
  featured = false,
  cta,
}: {
  name: string;
  price: string;
  per?: string;
  blurb: string;
  features: string[];
  note?: React.ReactNode;
  featured?: boolean;
  cta: React.ReactNode;
}) {
  return (
    <div className={`card p-7 flex flex-col ${featured ? "border-ink shadow-[var(--shadow-md)]" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[14px] font-semibold">{name}</div>
        {featured && <span className="badge badge-outline">Recommended</span>}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="display text-[40px] tnum">{price}</span>
        {per && <span className="text-ink-3 text-[14px]">{per}</span>}
      </div>
      <p className="text-[13.5px] text-ink-2 mt-1.5">{blurb}</p>
      <ul className="list-none p-0 m-0 mt-5 flex flex-col gap-2.5">
        {features.map((f) => (
          <li key={f} className="flex gap-2.5 text-[14px]">
            <IconCheck className="text-brand mt-[3px] shrink-0" />
            {f}
          </li>
        ))}
      </ul>
      {note && <div className="caption mt-5 leading-[1.55]">{note}</div>}
      <div className="mt-auto pt-7">{cta}</div>
    </div>
  );
}
