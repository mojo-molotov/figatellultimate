'use client';

/**
 * Desktop pagination controls for a section's list (`/docs`): `PageSelect` above at the end, `Pagination` below at
 * the end, backed by `@figatellultimate/facets` (`?page=N`, History API). Loaded as a lazy chunk by `section-list.tsx`
 * so pages without a section never ship `@figatellultimate/facets-react` or Radix Select/DropdownMenu.
 */
import { defineFacetedCollection, type UrlAdapter } from '@figatellultimate/facets';
import { PageSelect, Pagination, useFacetedCollection } from '@figatellultimate/facets-react';
import { NextUrlBoundary } from '@figatellultimate/next16/facets';
import { formatPrecompiled } from '@figatellultimate/use-intl/format';
import { useEffect, useMemo, type ReactNode } from 'react';

import { localeInfo, type Locale } from '#figatellultimate/locales';

import type { ListingLabels } from '../blog/listing-labels';
import { PAGINATION_ICONS } from '../blog/pagination-icons';

export interface SectionPaginationProps {
  readonly totalCards: number;
  readonly batchSize: number;
  readonly locale: Locale;
  readonly labels: ListingLabels['pagination'];
  readonly onPageChange: (page: number) => void;
  readonly onPrefetchPage: (page: number) => void;
  readonly children: ReactNode;
}

/**
 * Wraps a section's list with desktop-only `PageSelect` (above) and `Pagination` (below).
 *
 * @param props - Card count, batch size, locale, pagination labels, callbacks and the list content.
 * @returns The list framed by `PageSelect` and `Pagination` (hidden on phones by `base.css`).
 */
export function SectionPagination(props: SectionPaginationProps): ReactNode {
  return <NextUrlBoundary>{(url) => <SectionPaginationView {...props} url={url} />}</NextUrlBoundary>;
}

function SectionPaginationView({
  totalCards,
  batchSize,
  locale,
  labels,
  onPageChange,
  onPrefetchPage,
  children,
  url,
}: SectionPaginationProps & { readonly url: UrlAdapter }): ReactNode {
  const keys = useMemo(() => Array.from({ length: totalCards }, (_, index) => String(index)), [totalCards]);
  const engine = useMemo(
    () =>
      defineFacetedCollection<string>({
        items: keys,
        key: String,
        facets: {},
        sorts: { given: () => 0 },
        perPage: batchSize,
      }),
    [keys, batchSize],
  );
  // Hook `prefetch` on the URL adapter so hovering/focusing a pagination link preloads its JSON batch.
  const adapter = useMemo<UrlAdapter>(
    () => ({
      ...url,
      prefetch: (search) => {
        const page = Number(new URLSearchParams(search).get('page') ?? '1');

        if (Number.isInteger(page) && page >= 2) onPrefetchPage(page);
      },
    }),
    [url, onPrefetchPage],
  );
  const binding = useFacetedCollection(engine, adapter);
  const page = binding.state.page;

  useEffect(() => {
    onPageChange(page);
  }, [page, onPageChange]);

  const dir = localeInfo[locale].dir;

  return (
    <>
      <PageSelect
        binding={binding}
        labels={{
          trigger: labels.jump,
          current: (current, pages) => formatPrecompiled(labels.short, locale, { page: current, pages }),
          spoken: (current, pages) => formatPrecompiled(labels.spoken, locale, { page: current, pages }),
          page: (number) => formatPrecompiled(labels.page, locale, { page: number }),
        }}
        locale={locale}
        dir={dir}
      />
      {children}
      <Pagination
        binding={binding}
        labels={{
          nav: labels.nav,
          previous: labels.previous,
          next: labels.next,
          page: (number) => formatPrecompiled(labels.page, locale, { page: number }),
          current: (number, total) => formatPrecompiled(labels.current, locale, { page: number, pages: total }),
          more: (hidden) => formatPrecompiled(labels.more, locale, { from: hidden[0] ?? 0, to: hidden.at(-1) ?? 0 }),
        }}
        locale={locale}
        dir={dir}
        icons={PAGINATION_ICONS}
      />
    </>
  );
}
