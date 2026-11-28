'use client';

/**
 * A section's list of pages (`/docs`), sharing one set of static JSON batches across both viewports:
 *
 *     SectionPages (server: first 4 cards) ──> SectionList ──> <ul data-slot="folder-list">
 *         ├─ phone (`max-width: 36rem`): IntersectionObserver + spinner appends batches on scroll
 *         └─ desktop (`> 36rem`): lazy `SectionPagination` (`PageSelect` above, `Pagination` below) switches pages
 *
 * Key design decisions:
 *     - Same prerendered HTML (first 4 cards only) for every screen, no `User-Agent` detection: on a desktop, the
 *       scroll observer stays off (`matchMedia('(max-width: 36rem)')`), so nothing flickers on arrival and the reader
 *       pages through batches with `PageSelect` and `Pagination`; on a phone, the pagination controls are hidden by
 *       `base.css` and scrolling appends batches seamlessly with a spinner.
 *     - `SectionPagination` is loaded lazily (`React.lazy`) so other pages on the root route (`/`, `/docs/*`) never
 *       ship `@figatellultimate/facets-react` or Radix Select/DropdownMenu in their initial chunks.
 *
 * Invariants: `/docs` prerenders four cards and writes its remaining batches as static JSON (`scripts/verify.ts`);
 * on a phone scrolling fetches every batch, on a desktop the pagination switches pages without scroll-loading
 * (`scripts/browse.ts`).
 */
import { Collector } from '@figatellultimate/effects';
import { EntryCard, type EntryCardLabels } from '@figatellultimate/ui';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import * as v from 'valibot';

import type { Locale } from '#figatellultimate/locales';

import type { ListingLabels } from '../blog/listing-labels';
import type { SectionBatchItem } from '../lib/section-batches';

const SectionPagination = lazy(async () => ({
  default: (await import('./section-pagination')).SectionPagination,
}));

/** Breakpoint matching `base.css`: phone scroll-loading below this width, desktop pagination above. */
const PHONE_MEDIA = '(max-width: 36rem)';

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
  const [batches, setBatches] = useState<Readonly<Record<number, readonly SectionBatchItem[]>>>({});
  const [page, setPage] = useState(1);
  const [phone, setPhone] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading'>('idle');
  const sentinel = useRef<HTMLDivElement>(null);
  const requests = useRef(new Map<number, Promise<readonly SectionBatchItem[] | undefined>>());

  const fetchBatch = useCallback(
    (batchIndex: number): Promise<readonly SectionBatchItem[] | undefined> => {
      const url = batchUrls[batchIndex];

      if (url === undefined) return Promise.resolve(undefined);

      const pending = requests.current.get(batchIndex);

      if (pending !== undefined) return pending;

      const promise = fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);

          return response.json() as Promise<unknown>;
        })
        .then((json) => {
          const items = v.parse(BatchSchema, json);

          setBatches((previous) => ({ ...previous, [batchIndex]: items }));

          return items;
        })
        .catch(() => {
          requests.current.delete(batchIndex);

          return undefined;
        });

      requests.current.set(batchIndex, promise);

      return promise;
    },
    [batchUrls],
  );

  // Track whether the viewport is a phone (`<= 36rem`): scroll-loading runs on phones only, never on desktop.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia(PHONE_MEDIA);
    const update = (): void => {
      setPhone(query.matches);
    };

    update();
    query.addEventListener('change', update);

    return () => {
      query.removeEventListener('change', update);
    };
  }, []);

  // Desktop page selection: fetch the chosen page's batch when not yet cached.
  const handlePageChange = useCallback(
    (nextPage: number): void => {
      setPage(nextPage);

      if (nextPage < 2) return;

      const batchIndex = nextPage - 2;

      if (batches[batchIndex] !== undefined) return;

      setStatus('loading');
      void fetchBatch(batchIndex).finally(() => {
        setStatus('idle');
      });
    },
    [batches, fetchBatch],
  );

  const handlePrefetchPage = useCallback(
    (nextPage: number): void => {
      if (nextPage >= 2) void fetchBatch(nextPage - 2);
    },
    [fetchBatch],
  );

  // Next unloaded batch index for phone scroll-loading.
  const nextScrollBatch = batchUrls.findIndex((_, index) => batches[index] === undefined);
  const hasMoreScroll = phone && nextScrollBatch !== -1;

  useEffect(() => {
    if (!hasMoreScroll) return;

    const target = sentinel.current;

    if (target === null || typeof IntersectionObserver === 'undefined') return;

    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;

        setStatus('loading');
        void fetchBatch(nextScrollBatch).finally(() => {
          if (active) setStatus('idle');
        });
      },
      { rootMargin: '200px' },
    );

    observer.observe(target);

    return () => {
      active = false;
      observer.disconnect();
    };
  }, [hasMoreScroll, nextScrollBatch, fetchBatch]);

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

  // On a phone: initial batch + every loaded batch appended in order. On a desktop: only the active page's batch.
  const loadedScrollBatches = batchUrls.flatMap((_, index) => {
    const items = batches[index];

    return items === undefined ? [] : [items];
  });
  const activeDesktopBatch = page >= 2 ? batches[page - 2] : undefined;
  const list = (
    <>
      <ul data-slot="folder-list">
        {phone || page === 1 ? initial.map((item) => <li key={item.key}>{item.node}</li>) : null}
        {phone ? loadedScrollBatches.flatMap((items) => renderBatchItems(items)) : null}
        {!phone && page >= 2 && activeDesktopBatch !== undefined ? renderBatchItems(activeDesktopBatch) : null}
      </ul>
      {hasMoreScroll || status === 'loading' ? (
        <div ref={sentinel} data-slot="section-list-status" data-status={status} aria-hidden>
          <span data-slot="section-list-spinner" />
        </div>
      ) : null}
    </>
  );

  return (
    <div data-slot="section-list">
      <Suspense fallback={null}>
        <SectionPagination
          totalCards={totalCards}
          batchSize={batchSize}
          locale={locale}
          labels={paginationLabels}
          onPageChange={handlePageChange}
          onPrefetchPage={handlePrefetchPage}
        >
          {list}
        </SectionPagination>
      </Suspense>
    </div>
  );
}
