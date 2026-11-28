'use client';

// prettier-ignore
/**
 * A section's list of pages (`/docs`), revealed in batches as the reader scrolls on a phone: zero external
 * dependencies (no facets, no Radix, no router), just an `IntersectionObserver` on a sentinel below the list.
 *
 *     SectionPages (server: every card) ──> SectionList ──> each <li>, marked `data-paged-out` past the revealed count
 *                                                    └─> sentinel below the list: intersecting reveals the next batch
 *     the theme's stylesheet: on a phone (`max-width: 36rem`), hides the marked items; on a desktop, shows every card
 *
 * Key design decisions:
 *     - Progressive scroll reveal rather than pagination: on a phone, starts with four cards (shorter page, off-page
 *       lazy images never fetched on arrival) and reveals four more as the reader approaches the end, until every
 *       card is shown. On a desktop, every card is visible from the first paint, the same prerendered HTML.
 *     - No external UI or state library: keeps the pages route's bundle minimal.
 *
 * Invariants: the first four cards unmarked and the rest marked `data-paged-out` in the prerendered HTML
 * (`scripts/verify.ts`); on a desktop every card visible at once, on a phone four on arrival and more revealed on
 * scroll until every card shows (`scripts/browse.ts`).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** An item of the list: a card, counted in the batches, or a subfolder's heading, revealed with the card after it. */
export interface SectionListItem {
  readonly key: string;
  readonly card: boolean;
  /** What the item's `<li>` holds, rendered on the server. */
  readonly node: ReactNode;
}

/**
 * A section's list of pages, revealed by batches on scroll on a phone.
 *
 * @param props - The items and how many cards each batch reveals.
 * @returns The list, with a sentinel below it while cards remain hidden.
 */
export function SectionList({
  items,
  batchSize,
}: {
  readonly items: readonly SectionListItem[];
  readonly batchSize: number;
}): ReactNode {
  const cards = items.filter((item) => item.card).length;
  const [shown, setShown] = useState(batchSize);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shown >= cards) return;

    const target = sentinel.current;

    if (target === null || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setShown((count) => Math.min(count + batchSize, cards));
      },
      { rootMargin: '200px' },
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [shown, cards, batchSize]);

  // Each item's card rank: its own, or, for a heading, the card after it (the last card for a heading at the end).
  const rankOf = (index: number): number => {
    const before = items.slice(0, index).filter((item) => item.card).length;

    return before >= cards ? cards - 1 : before;
  };

  return (
    <>
      <ul data-slot="folder-list">
        {items.map((item, index) => (
          <li key={item.key} {...(rankOf(index) < shown ? {} : { 'data-paged-out': '' })}>
            {item.node}
          </li>
        ))}
      </ul>
      {shown < cards ? <div ref={sentinel} aria-hidden /> : null}
    </>
  );
}
