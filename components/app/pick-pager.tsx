import Link from "next/link";

/**
 * "1 of 5" — the whole week in one control, beside the pick's title.
 *
 * Server-rendered links rather than a client select: each pick is a real
 * URL, so it is shareable, back-buttonable, and readable without
 * JavaScript. The arrows wrap nothing: at the ends they render disabled
 * rather than looping, because looping a five-item list silently is how an
 * owner loses track of which picks they have actually swept.
 */
export default function PickPager({
  index,
  items,
}: {
  /** Zero-based position of the pick on screen. */
  index: number;
  /** Every pick of the week in rank order. */
  items: { href: string; term: string }[];
}) {
  const total = items.length;
  if (total <= 1) return null;
  const prev = index > 0 ? items[index - 1] : null;
  const next = index < total - 1 ? items[index + 1] : null;
  return (
    <nav className="pager" aria-label="This week's picks">
      {prev ? (
        <Link className="pager__arrow" href={prev.href} aria-label={`Previous pick: ${prev.term}`} rel="prev">
          ‹
        </Link>
      ) : (
        <span className="pager__arrow is-off" aria-hidden="true">
          ‹
        </span>
      )}
      <span className="pager__label">
        <b>{index + 1}</b> of {total}
      </span>
      {next ? (
        <Link className="pager__arrow" href={next.href} aria-label={`Next pick: ${next.term}`} rel="next">
          ›
        </Link>
      ) : (
        <span className="pager__arrow is-off" aria-hidden="true">
          ›
        </span>
      )}
      <ol className="pager__dots">
        {items.map((it, i) => (
          <li key={it.href}>
            <Link href={it.href} className={i === index ? "is-on" : undefined} aria-current={i === index ? "page" : undefined} title={it.term}>
              <span className="sr-only">{it.term}</span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
