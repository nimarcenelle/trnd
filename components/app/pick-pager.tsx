import Link from "next/link";

/**
 * "Pick 1 of 5" — the whole week in one control, top right.
 *
 * Server-rendered links rather than a client select: each pick is a real
 * URL (?pick=2), so it is shareable, back-buttonable, and readable without
 * JavaScript. The arrows wrap nothing — at the ends they render disabled
 * rather than looping, because looping a five-item list silently is how an
 * owner loses track of which picks they have actually swept.
 */
export default function PickPager({
  index,
  total,
  terms,
}: {
  /** Zero-based. */
  index: number;
  total: number;
  /** Every pick's term, for the dropdown labels. */
  terms: string[];
}) {
  if (total <= 1) return null;
  const href = (i: number) => (i === 0 ? "/app" : `/app?pick=${i + 1}`);
  const prev = index > 0 ? href(index - 1) : null;
  const next = index < total - 1 ? href(index + 1) : null;
  return (
    <nav className="pager" aria-label="This week's picks">
      {prev ? (
        <Link className="pager__arrow" href={prev} aria-label="Previous pick" rel="prev">
          ‹
        </Link>
      ) : (
        <span className="pager__arrow is-off" aria-hidden="true">‹</span>
      )}
      <span className="pager__label">
        Pick <b>{index + 1}</b> of {total}
      </span>
      {next ? (
        <Link className="pager__arrow" href={next} aria-label="Next pick" rel="next">
          ›
        </Link>
      ) : (
        <span className="pager__arrow is-off" aria-hidden="true">›</span>
      )}
      <ol className="pager__dots">
        {terms.slice(0, total).map((term, i) => (
          <li key={term + i}>
            <Link
              href={href(i)}
              className={i === index ? "is-on" : undefined}
              aria-current={i === index ? "true" : undefined}
              title={term}
            >
              <span className="sr-only">{term}</span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
