'use client';

/**
 * A section's list of pages (`/docs`), sharing one set of static JSON batches across both viewports via
 * `useResponsiveBatches` and `createIndexLoader` of `@figatellultimate/facets-react`:
 *
 *     SectionPages (server: first 4 cards) ──> SectionList ──> <ul data-slot="folder-list">
 *         ├─ phone (`max-width: 36rem`): IntersectionObserver + spinner appends batches on scroll
 *         └─ desktop (`> 36rem`): lazy `SectionPagination` (`PageSelect` beside H1, `Pagination` below)
 *
 * Key design decisions:
 *     - Cards render outside the lazy `<Suspense>` boundary so initial HTML and client navigations paint all four
 *       cards immediately without waiting for the pagination chunk (`scripts/verify.ts`).
 *     - `SectionPagination` stays lazy (`React.lazy`) so other pages on the root route (`/`, `/docs/*`) never ship
 *       Radix Select/DropdownMenu in their initial chunks.
 *
 * Invariants: `/docs` prerenders four cards directly inside `<main>` and writes its remaining batches as static JSON
 * (`scripts/verify.ts`); on a phone scrolling fetches every batch, on a desktop the pagination switches pages without
 * scroll-loading (`scripts/browse.ts`).
 */
import { Collector } from '@figatellultimate/effects';
import { createIndexLoader, useResponsiveBatches } from '@figatellultimate/facets-react';
import { EntryCard, type EntryCardLabels } from '@figatellultimate/ui';
import { lazy, Suspense, type ReactNode } from 'react';
import * as v from 'valibot';

import type { Locale } from '#figatellultimate/locales';

import type { ListingLabels } from '../blog/listing-labels';
import type { SectionBatchItem } from '../lib/section-batches';

const SectionPagination = lazy(async () => ({
  default: (await import('./section-pagination')).SectionPagination,
}));

/** An item rendered on the server for the initial batch. */
export interface SectionInitialItem {
  readonly key: string;
  readonly node: ReactNode;
}

const BatchSchema = v.array(
  v.variant('kind', [
    v.object({ kind: v.literal('heading'), key: v.string(), title: v.string() }),
    v.object({
      kind: v.literal('card'),
      key: v.string(),
      href: v.string(),
      title: v.string(),
      description: v.optional(v.string()),
      image: v.optional(v.string()),
    }),
  ]),
);

const loadSectionBatch = createIndexLoader<readonly SectionBatchItem[]>((json) => v.parse(BatchSchema, json));

/**
 * A section's list of pages: scroll-loaded on a phone, paginated on a desktop, sharing the same static JSON batches.
 *
 * @param props - The server-rendered first batch, remaining JSON batch URLs, total card count, batch size, locale and
 *   labels.
 * @returns The list with desktop pagination controls and a mobile scroll sentinel/spinner.
 */
export function SectionList({
  initial,
  batchUrls,
  totalCards,
  batchSize,
  locale,
  labels,
  paginationLabels,
}: {
  readonly initial: readonly SectionInitialItem[];
  readonly batchUrls: readonly string[];
  readonly totalCards: number;
  readonly batchSize: number;
  readonly locale: Locale;
  readonly labels: EntryCardLabels;
  readonly paginationLabels: ListingLabels['pagination'];
}): ReactNode {
  const {
    phone,
    page,
    loadedScrollBatches,
    activeDesktopBatch,
    hasMoreScroll,
    status,
    sentinelRef,
    selectPage,
    prefetchPage,
  } = useResponsiveBatches({ batchUrls, load: loadSectionBatch });

  const renderBatchItems = (items: readonly SectionBatchItem[]): ReactNode =>
    items.map((item) => (
      <li key={item.key}>
        {item.kind === 'heading' ? (
          <h2>{item.title}</h2>
        ) : (
          <Collector>
            <EntryCard
              href={item.href}
              title={item.title}
              {...(item.description === undefined ? {} : { description: item.description })}
              {...(item.image === undefined ? {} : { image: item.image })}
              locale={locale}
              labels={labels}
            />
          </Collector>
        )}
      </li>
    ));

  return (
    <div data-slot="section-list">
      <ul data-slot="folder-list">
        {phone || page === 1 ? initial.map((item) => <li key={item.key}>{item.node}</li>) : null}
        {phone ? loadedScrollBatches.flatMap((items) => renderBatchItems(items)) : null}
        {!phone && page >= 2 && activeDesktopBatch !== undefined ? renderBatchItems(activeDesktopBatch) : null}
      </ul>
      {hasMoreScroll || status === 'loading' ? (
        <div ref={sentinelRef} data-slot="section-list-status" data-status={status} aria-hidden>
          <span data-slot="section-list-spinner" />
        </div>
      ) : null}
      <Suspense fallback={null}>
        <SectionPagination
          totalCards={totalCards}
          batchSize={batchSize}
          locale={locale}
          labels={paginationLabels}
          onPageChange={selectPage}
          onPrefetchPage={prefetchPage}
        />
      </Suspense>
    </div>
  );
}
