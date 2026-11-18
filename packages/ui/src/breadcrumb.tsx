/**
 * The breadcrumb: static, built with the page, every step with a page a real link.
 *
 * Invariants (`breadcrumb.test.tsx`): a landmark of real links, the current page marked and never linked, a section
 * without a page as text, nothing for the home alone, axe.
 */
import type { ComponentProps, ReactNode } from 'react';

import { Link } from './link.js';

/**
 * One step of a breadcrumb, as `breadcrumbOf` (`@figatellu/site`) gives it: a message key `K` to translate (a
 * section) or a title (an entry).
 */
export type Crumb<K extends string = string> = (
  { readonly message: true; readonly label: K } | { readonly message: false; readonly label: string }
) & {
  /** A link when the step has a page; a section without one is plain text. */
  readonly url?: string | undefined;
  readonly current: boolean;
};

/** The breadcrumb's own texts. */
export interface BreadcrumbLabels {
  /** The navigation landmark's accessible name, e.g. "Breadcrumb". */
  readonly nav: string;
}

/** The breadcrumb's props: a `<nav>`'s, plus the steps, the translator and the labels. */
export interface BreadcrumbProps<K extends string = string> extends ComponentProps<'nav'> {
  /** `breadcrumbOf(navigationOf(locale), url, title)` from `@figatellu/site`, computed with the page. */
  readonly crumbs: readonly Crumb<K>[];
  /** The app's translator for message keys (section labels): it gets the keys the crumbs hold, typed. */
  readonly t: (key: K) => string;
  readonly labels: BreadcrumbLabels;
}

/**
 * A breadcrumb, the WAI-ARIA pattern.
 *
 * @param props - The steps (`breadcrumbOf`, computed with the page), the app's translator for section labels (typed
 *   by the keys the steps hold), the labels, and a `<nav>`'s props.
 * @returns A navigation landmark holding an ordered list of real links; the current page as text marked
 *   `aria-current="page"`, a section without a page as text; separators drawn by the stylesheet, silent for assistive
 *   technologies. Nothing for a single step (the home itself).
 *
 * @example
 * <Breadcrumb crumbs={breadcrumbOf(navigationOf(locale), url, title)} t={t} labels={{ nav: 'Fil d’Ariane' }} />
 */
export function Breadcrumb<K extends string>({ crumbs, t, labels, ...props }: BreadcrumbProps<K>): ReactNode {
  if (crumbs.length <= 1) return null;

  return (
    <nav aria-label={labels.nav} data-slot="breadcrumb" {...props}>
      <ol data-slot="breadcrumb-list">
        {crumbs.map((crumb) => {
          const label = crumb.message ? t(crumb.label) : crumb.label;

          return (
            <li key={`${crumb.label}\u0000${crumb.url ?? ''}`} data-slot="breadcrumb-item">
              {crumb.current ? (
                // The page itself: named, never a link to where the reader already is.
                <span aria-current="page" data-slot="breadcrumb-current">
                  {label}
                </span>
              ) : crumb.url === undefined ? (
                <span data-slot="breadcrumb-text">{label}</span>
              ) : (
                <Link href={crumb.url} data-slot="breadcrumb-link">
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
