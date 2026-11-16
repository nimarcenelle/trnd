import { existsSync } from "node:fs";
import path from "node:path";

/** Schools whose admitted students have used Admitted. A logo file in public/logos/<id>.svg replaces the name. */
const SCHOOLS = [
  { id: "harvard", name: "Harvard" },
  { id: "yale", name: "Yale" },
  { id: "princeton", name: "Princeton" },
  { id: "stanford", name: "Stanford" },
  { id: "mit", name: "MIT" },
  { id: "penn", name: "Penn" },
  { id: "columbia", name: "Columbia" },
  { id: "brown", name: "Brown" },
  { id: "dartmouth", name: "Dartmouth" },
  { id: "cornell", name: "Cornell" },
  { id: "duke", name: "Duke" },
  { id: "uchicago", name: "UChicago" },
  { id: "northwestern", name: "Northwestern" },
  { id: "caltech", name: "Caltech" },
  { id: "georgetown", name: "Georgetown" },
];

const hasLogo = (id: string) => existsSync(path.join(process.cwd(), "public", "logos", `${id}.svg`));

function Mark({ id, name }: { id: string; name: string }) {
  return hasLogo(id) ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/logos/${id}.svg`} alt={name} className="h-8 sm:h-9 w-auto max-w-[200px] object-contain brightness-0 opacity-55 hover:opacity-90 transition-opacity dark:invert" loading="lazy" />
  ) : (
    <span className="text-[20px] sm:text-[22px] font-semibold tracking-[-0.02em] text-ink-3 whitespace-nowrap">{name}</span>
  );
}

export default function LogoStrip() {
  return (
    <div>
      <p className="text-center text-[13px] font-medium text-ink-3">Used by students admitted to</p>
      <div className="marquee mt-6 overflow-hidden">
        <ul className="marquee-track list-none p-0 m-0 flex w-max items-center gap-14 sm:gap-20">
          {[...SCHOOLS, ...SCHOOLS].map((s, i) => (
            <li key={`${s.id}-${i}`} aria-hidden={i >= SCHOOLS.length} className="shrink-0">
              <Mark id={s.id} name={s.name} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
