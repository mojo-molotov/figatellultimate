'use client';

/**
 * Desktop pagination controls for a section's list (`/docs`, `/docs/page/2`, …): `BatchPagination` of
 * `@figatellultimate/facets-react` wired to `NextUrlBoundary` with path-based `/page/N` URLs. Loaded as a lazy chunk by
 * `section-list.tsx` so pages without a section never ship Radix Select/DropdownMenu in their initial bundle.
 */
import { BatchPagination } from '@figatellultimate/facets-react';
import { NextUrlBoundary } from '@figatellultimate/next16/facets';
import { formatPrecompiled } from '@figatellultimate/use-intl/format';
import type { ReactNode } from 'react';

import { localeInfo, type Locale } from '#figatellultimate/locales';
import { pageSegment } from '#figatellultimate/urls';

import type { ListingLabels } from '../blog/listing-labels';
import { PAGINATION_ICONS } from '../blog/pagination-icons';

export interface SectionPaginationProps {
  readonly first: string;
  readonly page: number;
  readonly totalCards: number;
  readonly batchSize: number;
  readonly locale: Locale;
  readonly labels: ListingLabels['pagination'];
  readonly onPageChange: (page: number) => void;
  readonly onPrefetchPage: (page: number) => void;
}

/**
 * `PageSelect` (aligned with the page's heading via CSS Grid) and `Pagination` (below the list), linking to real
 * prerendered `/page/N` routes and switching locally from static JSON batches.
 *
 * @param props - First page URL, landed page number, card count, batch size, locale, pagination labels and callbacks.
 * @returns `BatchPagination` inside `NextUrlBoundary` (hidden on phones on page 1 by `base.css`).
 */
export function SectionPagination({
  first,
  page,
  totalCards,
  batchSize,
  locale,
  labels,
  onPageChange,
  onPrefetchPage,
}: SectionPaginationProps): ReactNode {
  const dir = localeInfo[locale].dir;

  return (
    <NextUrlBoundary first={first} page={page} segment={pageSegment}>
      {(url) => (
        <BatchPagination
          totalItems={totalCards}
          batchSize={batchSize}
          url={url}
          locale={locale}
          dir={dir}
          onPageChange={onPageChange}
          onPrefetchPage={onPrefetchPage}
          selectLabels={{
            trigger: labels.jump,
            current: (current, pages) => formatPrecompiled(labels.short, locale, { page: current, pages }),
            spoken: (current, pages) => formatPrecompiled(labels.spoken, locale, { page: current, pages }),
            page: (number) => formatPrecompiled(labels.page, locale, { page: number }),
          }}
          paginationLabels={{
            nav: labels.nav,
            previous: labels.previous,
            next: labels.next,
            page: (number) => formatPrecompiled(labels.page, locale, { page: number }),
            current: (number, total) => formatPrecompiled(labels.current, locale, { page: number, pages: total }),
            more: (hidden) => formatPrecompiled(labels.more, locale, { from: hidden[0] ?? 0, to: hidden.at(-1) ?? 0 }),
          }}
          icons={PAGINATION_ICONS}
        />
      )}
    </NextUrlBoundary>
  );
}
