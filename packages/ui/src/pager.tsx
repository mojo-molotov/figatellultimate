/**
 * The pager: the previous and next pages of a section (a documentation), at the end of a page.
 *
 *     ← Previous                    Next →
 *       Installation          Configuration
 *
 * Key design decisions:
 *     - The pages come from the app (e.g. `neighboursOf` of `@figatellultimate/site`, in the navigation's order): this
 *       component only links them, through the app's link component (`LinkProvider`).
 *     - No text of its own: the landmark's name and the "previous" and "next" words are labels; each link is named by
 *       its word and the page's title, so that a screen reader says where it leads.
 *     - Nothing at an end: no empty box, no disabled link.
 *
 * Invariants (`pager.test.tsx`): a navigation landmark, the links in reading order, nothing without a page on either
 * side.
 */
import type { ComponentProps, ReactNode } from 'react';

import { Link } from './link.js';

/** A page the pager links: its URL and title. */
export interface PagerPage {
  readonly url: string;
  readonly title: string;
}

/** Every text of the pager of its own. */
export interface PagerLabels {
  /** The landmark's accessible name, e.g. "Pages of the documentation". */
  readonly nav: string;
  /** The word above the previous page's title, e.g. "Previous". */
  readonly previous: string;
  /** The word above the next page's title, e.g. "Next". */
  readonly next: string;
}

/** The pager's props: a `<nav>`'s, the pages on either side, and the labels. */
export interface PagerProps extends ComponentProps<'nav'> {
  readonly previous?: PagerPage | undefined;
  readonly next?: PagerPage | undefined;
  readonly labels: PagerLabels;
}

/**
 * Links to the previous and next pages of a section.
 *
 * @param props - The pages on either side (either may be missing), the labels, and the `<nav>`'s props.
 * @returns A `data-slot="pager"` navigation landmark with up to two links; `null` with no page on either side.
 *
 * @example
 * const { previous, next } = neighboursOf(navigationOf(locale), url);
 * <Pager previous={previous} next={next} labels={{ nav: 'Pages', previous: 'Previous', next: 'Next' }} />
 */
export function Pager({ previous, next, labels, ...props }: PagerProps): ReactNode {
  if (previous === undefined && next === undefined) return null;

  return (
    <nav aria-label={labels.nav} data-slot="pager" {...props}>
      {previous === undefined ? null : (
        <Link href={previous.url} data-slot="pager-link" data-direction="previous" rel="prev">
          <span data-slot="pager-label">{labels.previous}</span>
          <span data-slot="pager-title">{previous.title}</span>
        </Link>
      )}
      {next === undefined ? null : (
        <Link href={next.url} data-slot="pager-link" data-direction="next" rel="next">
          <span data-slot="pager-label">{labels.next}</span>
          <span data-slot="pager-title">{next.title}</span>
        </Link>
      )}
    </nav>
  );
}
