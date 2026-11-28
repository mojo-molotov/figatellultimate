'use client';

/**
 * Pagination controls for static batch lists (`BatchPagination` and `useBatchPagination`): connects `PageSelect` and
 * `Pagination` to a key-only faceted collection over `totalItems` / `batchSize`, forwarding active page changes and
 * hover/focus prefetches to `useResponsiveBatches` (or any batch store).
 *
 * Key design decisions:
 *     - Framework-free URL adapter (`url`): works with `NextUrlBoundary` of `@figatellultimate/next16/facets`,
 *       `useHistoryUrl`, or any custom `UrlAdapter` without coupling `@figatellultimate/facets-react` to Next.js.
 *     - Prefetch interception: wraps `url.prefetch` so hovering or focusing a pagination link warms the batch cache
 *       via `onPrefetchPage` instead of fetching a server route.
 *     - Separate module (`unbundle: true`, `sideEffects: false`): apps can lazy-load `BatchPagination` independently
 *       from `ResponsiveBatchList` so Radix Select/DropdownMenu stay out of initial chunks.
 *
 * Invariants (`responsive-batch-list.test.tsx`): computes pages from `totalItems` / `batchSize`, notifies
 * `onPageChange` when the URL changes, calls `onPrefetchPage` when hovering/focusing a page `>= 2`, and renders both
 * `PageSelect` and `Pagination` (nothing for a single page).
 */
import { defineFacetedCollection, type UrlAdapter } from '@figatellultimate/facets';
import { useEffect, useMemo, type ReactNode } from 'react';

import { useFacetedCollection, type FacetedCollectionBinding } from '../use-faceted-collection.js';
import { PageSelect, type PageSelectLabels } from './page-select.js';
import { Pagination, type PaginationIcons, type PaginationLabels } from './pagination.js';

/** Options of `useBatchPagination`. */
export interface BatchPaginationOptions {
  /** Total number of items across every batch. */
  readonly totalItems: number;
  /** Number of items per batch / page (positive integer). */
  readonly batchSize: number;
  /** URL adapter owning the `?page=N` state (e.g. from `NextUrlBoundary` or `useHistoryUrl`). */
  readonly url: UrlAdapter;
  /** Called whenever the active 1-based page changes. */
  readonly onPageChange: (page: number) => void;
  /** Called when pagination prefetches a page (`>= 2`). */
  readonly onPrefetchPage: (page: number) => void;
  /** Query parameter name for the page number; default `'page'`. */
  readonly param?: string | undefined;
}

/**
 * Builds a `FacetedCollectionBinding` over a static batch count and syncs page changes and prefetches with a batch
 * loader (`useResponsiveBatches`).
 *
 * @param options - Total item count, batch size, URL adapter, page-change and prefetch callbacks.
 * @returns A binding ready to pass to `PageSelect` and `Pagination`.
 *
 * @example
 * const binding = useBatchPagination({ totalItems: 11, batchSize: 4, url, onPageChange, onPrefetchPage });
 */
export function useBatchPagination(options: BatchPaginationOptions): FacetedCollectionBinding {
  const { totalItems, batchSize, url, onPageChange, onPrefetchPage, param = 'page' } = options;
  const keys = useMemo(
    () => Array.from({ length: Math.max(0, totalItems) }, (_, index) => String(index)),
    [totalItems],
  );
  const engine = useMemo(
    () =>
      defineFacetedCollection<string>({
        items: keys,
        key: String,
        facets: {},
        sorts: { given: () => 0 },
        perPage: batchSize,
        params: { page: param },
      }),
    [keys, batchSize, param],
  );
  const adapter = useMemo<UrlAdapter>(
    () => ({
      ...url,
      // Page switches are rendered locally from static JSON batches: move the address without a full route fetch.
      navigate: (next, navOptions) => {
        url.navigate(next, { ...navOptions, local: true });
      },
      prefetch: (search) => {
        const page = Number(new URLSearchParams(search).get(param) ?? '1');

        if (Number.isInteger(page) && page >= 1) onPrefetchPage(page);
      },
    }),
    [url, param, onPrefetchPage],
  );
  const binding = useFacetedCollection(engine, adapter);
  const page = binding.state.page;

  useEffect(() => {
    onPageChange(page);
  }, [page, onPageChange]);

  return binding;
}

/** Props of `BatchPagination`. */
export interface BatchPaginationProps extends BatchPaginationOptions {
  /** Locale used to format page numbers. */
  readonly locale: string;
  /** Reading direction (`'ltr'` or `'rtl'`). */
  readonly dir?: 'ltr' | 'rtl' | undefined;
  /** Labels for the compact `PageSelect` control. */
  readonly selectLabels: PageSelectLabels;
  /** Labels for the full `Pagination` control. */
  readonly paginationLabels: PaginationLabels;
  /** Optional icons for previous and next links in `Pagination`. */
  readonly icons?: PaginationIcons | undefined;
}

/**
 * Renders both `PageSelect` and `Pagination` for a static batch list, wired to `useBatchPagination`.
 *
 * @param props - Batch counts, URL adapter, callbacks, locale, direction, labels and optional icons.
 * @returns `PageSelect` followed by `Pagination` (nothing rendered when there is only one page).
 *
 * @example
 * <BatchPagination totalItems={11} batchSize={4} url={url} locale="en" onPageChange={selectPage} onPrefetchPage={prefetchPage} selectLabels={selectLabels} paginationLabels={paginationLabels} />
 */
export function BatchPagination({
  locale,
  dir,
  selectLabels,
  paginationLabels,
  icons,
  ...options
}: BatchPaginationProps): ReactNode {
  const binding = useBatchPagination(options);

  return (
    <>
      <PageSelect binding={binding} labels={selectLabels} locale={locale} {...(dir === undefined ? {} : { dir })} />
      <Pagination
        binding={binding}
        labels={paginationLabels}
        locale={locale}
        {...(dir === undefined ? {} : { dir })}
        {...(icons === undefined ? {} : { icons })}
      />
    </>
  );
}
