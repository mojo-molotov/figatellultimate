'use client';

/**
 * A folder page's pagination: links to its prerendered pages (`/page/N`), reached through the router, which fetches
 * each one with its slice. The engine's pagination, over the pages themselves: the same component and behavior as a
 * listing's, with nothing to filter.
 */
import { defineFacetedCollection, pagedHref, type UrlAdapter } from '@figatellultimate/facets';
import { Pagination, useFacetedCollection } from '@figatellultimate/facets-react';
import { formatPrecompiled } from '@figatellultimate/use-intl/format';
import { useRouter } from 'next/navigation';
import { useMemo, type ReactNode } from 'react';

import { localeInfo, type Locale } from '#figatellultimate/locales';

import type { ListingLabels } from './listing-labels';
import { PAGINATION_ICONS } from './pagination-icons';

/**
 * The pagination of a folder page.
 *
 * @param props - Its page and pages, its first page's URL, the locale and the pagination's texts.
 * @returns Real links to the folder's other pages; nothing for a single page.
 */
export function FolderPagination({
  page,
  pages,
  first,
  locale,
  labels,
}: {
  readonly page: number;
  readonly pages: number;
  readonly first: string;
  readonly locale: Locale;
  readonly labels: ListingLabels['pagination'];
}): ReactNode {
  const router = useRouter();
  // One item a page: the engine's pages are the folder's.
  const engine = useMemo(
    () =>
      defineFacetedCollection<number>({
        items: Array.from({ length: pages }, (_, index) => index + 1),
        key: String,
        facets: {},
        sorts: { given: () => 0 },
        perPage: 1,
      }),
    [pages],
  );
  const url = useMemo(
    (): UrlAdapter => ({
      search: page > 1 ? `?page=${String(page)}` : '',
      navigate: (next, { mode }) => {
        router[mode](pagedHref(first, next), { scroll: false });
      },
      href: (next) => pagedHref(first, next),
    }),
    [page, first, router],
  );

  return (
    <Pagination
      binding={useFacetedCollection(engine, url)}
      labels={{
        nav: labels.nav,
        previous: labels.previous,
        next: labels.next,
        page: (number) => formatPrecompiled(labels.page, locale, { page: number }),
        current: (number, total) => formatPrecompiled(labels.current, locale, { page: number, pages: total }),
        more: (hidden) => formatPrecompiled(labels.more, locale, { from: hidden[0] ?? 0, to: hidden.at(-1) ?? 0 }),
      }}
      locale={locale}
      dir={localeInfo[locale].dir}
      icons={PAGINATION_ICONS}
    />
  );
}
