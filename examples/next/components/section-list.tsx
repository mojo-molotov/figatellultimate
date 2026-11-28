'use client';

/**
 * A section's list of pages (`/docs`), delegating mobile scroll-loading and desktop pagination over static JSON
 * batches to `ResponsiveBatchList` and `createIndexLoader` of `@figatellultimate/facets-react`.
 *
 * Invariants: `/docs` prerenders four cards directly inside `<main>` and writes its remaining batches as static JSON
 * (`scripts/verify.ts`); on a phone scrolling fetches every batch, on a desktop the pagination switches pages without
 * scroll-loading (`scripts/browse.ts`).
 */
import { Collector } from '@figatellultimate/effects';
import { createIndexLoader, ResponsiveBatchList, type ResponsiveBatchItem } from '@figatellultimate/facets-react';
import { EntryCard, type EntryCardLabels } from '@figatellultimate/ui';
import { lazy, Suspense, type ReactNode } from 'react';
import * as v from 'valibot';

import type { Locale } from '#figatellultimate/locales';

import type { ListingLabels } from '../blog/listing-labels';
import type { SectionBatchItem } from '../lib/section-batches';
import { loadSectionPagination } from './section-pagination-preload';

const SectionPagination = lazy(async () => ({
  default: (await loadSectionPagination()).SectionPagination,
}));

/** An item rendered on the server for the initial batch. */
export type SectionInitialItem = ResponsiveBatchItem;

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
 * @returns `ResponsiveBatchList` with lazy desktop `SectionPagination`.
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
  return (
    <ResponsiveBatchList
      initial={initial}
      batchUrls={batchUrls}
      load={loadSectionBatch}
      renderItem={(item) => ({
        key: item.key,
        node:
          item.kind === 'heading' ? (
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
          ),
      })}
      renderPagination={({ onPageChange, onPrefetchPage }) => (
        <Suspense fallback={null}>
          <SectionPagination
            totalCards={totalCards}
            batchSize={batchSize}
            locale={locale}
            labels={paginationLabels}
            onPageChange={onPageChange}
            onPrefetchPage={onPrefetchPage}
          />
        </Suspense>
      )}
    />
  );
}
