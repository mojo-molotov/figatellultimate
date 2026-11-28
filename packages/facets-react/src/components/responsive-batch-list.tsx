'use client';

/**
 * Hybrid static batch list (`ResponsiveBatchList`): prerenders the first batch directly in the DOM (outside any
 * `<Suspense>`), appends further static JSON batches on scroll on phones (`IntersectionObserver` + spinner), and
 * switches batches through desktop pagination controls on wider screens.
 *
 *     initial (SSR batch 0) ──> <ul data-slot="folder-list">          (always painted on frame 1)
 *     batchUrls (1..N)      ──> useResponsiveBatches({ batchUrls, load })
 *         ├─ phone (`<= 36rem`): sentinel + spinner, pagination unmounted
 *         └─ desktop (`> 36rem`): `renderPagination({ onPageChange, onPrefetchPage })`
 *
 * Key design decisions:
 *     - Keeps the list outside any `<Suspense>` boundary so server HTML and client navigations always paint the first
 *       batch immediately without a blank flash.
 *     - Unmounts desktop pagination controls on phone viewports so they never prefetch desktop pages or consume
 *       memory on phones.
 *     - Imports only `useResponsiveBatches` (no Radix UI), so desktop pagination controls (`BatchPagination`) can be
 *       lazy-loaded in a separate chunk by the caller.
 *
 * Invariants (`responsive-batch-list.test.tsx`): renders initial items immediately on every viewport; appends batches
 * on scroll on phones without mounting pagination; mounts pagination and swaps pages on desktop without mounting the
 * scroll sentinel.
 */
import type { ReactNode } from 'react';

import { useResponsiveBatches } from '../use-responsive-batches.js';

/** One already-rendered item of the initial server batch or a rendered loaded item. */
export interface ResponsiveBatchItem {
  readonly key: string;
  readonly node: ReactNode;
}

/** Callbacks handed to `renderPagination` so desktop pagination controls drive `ResponsiveBatchList`. */
export interface ResponsiveBatchControls {
  /** Switches desktop pagination to `nextPage` (1-based). */
  readonly onPageChange: (nextPage: number) => void;
  /** Prefetches a desktop page (`>= 2`) into the batch loader cache. */
  readonly onPrefetchPage: (nextPage: number) => void;
}

/** Props of `ResponsiveBatchList`. */
export interface ResponsiveBatchListProps<TItem> {
  /** Server-rendered initial page items, always painted synchronously on first paint. */
  readonly initial: readonly ResponsiveBatchItem[];
  /** Static JSON batch URLs beyond page 1 (`batchUrls[0]` corresponds to page 2). */
  readonly batchUrls: readonly string[];
  /** 1-based page number already prerendered in `initial`; default `1`. Pages `>= 2` keep pagination on phones. */
  readonly initialPage?: number | undefined;
  /** Static JSON URL for page 1, used when `initialPage > 1` and the reader navigates back to page 1. */
  readonly firstBatchUrl?: string | undefined;
  /** Validated batch loader (typically `createIndexLoader` with a schema). */
  readonly load: (url: string) => Promise<readonly TItem[]>;
  /** Renders one item from a fetched batch into a keyed `ReactNode`. */
  readonly renderItem: (item: TItem) => ResponsiveBatchItem;
  /**
   * Renders desktop pagination controls (e.g. `BatchPagination`, optionally inside `<Suspense>` and `NextUrlBoundary`).
   * Automatically omitted on phone viewports.
   */
  readonly renderPagination?: ((controls: ResponsiveBatchControls) => ReactNode) | undefined;
  /** Media query identifying phone scroll-loading viewports; default `DEFAULT_PHONE_MEDIA`. */
  readonly phoneMedia?: string | undefined;
  /** `IntersectionObserver` root margin for phone scroll-loading; default `'200px'`. */
  readonly rootMargin?: string | undefined;
  /** `data-slot` on the outer wrapper; default `'section-list'`. */
  readonly slot?: string | undefined;
  /** `data-slot` on the `<ul>` element; default `'folder-list'`. */
  readonly listSlot?: string | undefined;
}

/**
 * Renders a static batch list that reveals batches on scroll on phones and paginates them on desktops.
 *
 * @param props - Initial server items, batch URLs, batch loader, item renderer and optional desktop pagination slot.
 * @returns The wrapper holding the `<ul>`, the scroll status sentinel/spinner when needed, and desktop pagination.
 *
 * @example
 * <ResponsiveBatchList initial={initial} batchUrls={batchUrls} load={loadBatch} renderItem={renderCard} renderPagination={renderPagination} />
 */
export function ResponsiveBatchList<TItem>({
  initial,
  batchUrls,
  initialPage = 1,
  firstBatchUrl,
  load,
  renderItem,
  renderPagination,
  phoneMedia,
  rootMargin,
  slot = 'section-list',
  listSlot = 'folder-list',
}: ResponsiveBatchListProps<TItem>): ReactNode {
  const {
    scrollMode,
    page,
    loadedScrollBatches,
    activeDesktopBatch,
    hasMoreScroll,
    status,
    sentinelRef,
    selectPage,
    prefetchPage,
  } = useResponsiveBatches({ batchUrls, load, initialPage, firstBatchUrl, phoneMedia, rootMargin });

  const renderBatch = (items: readonly TItem[]): ReactNode =>
    items.map((item) => {
      const rendered = renderItem(item);

      return <li key={rendered.key}>{rendered.node}</li>;
    });

  return (
    <div data-slot={slot} data-scroll-batches={initialPage === 1 && batchUrls.length > 0 ? '' : undefined}>
      <ul data-slot={listSlot}>
        {scrollMode || page === initialPage ? initial.map((item) => <li key={item.key}>{item.node}</li>) : null}
        {scrollMode ? loadedScrollBatches.flatMap((items) => renderBatch(items)) : null}
        {!scrollMode && page !== initialPage && activeDesktopBatch !== undefined
          ? renderBatch(activeDesktopBatch)
          : null}
      </ul>
      {hasMoreScroll || status === 'loading' ? (
        <div ref={sentinelRef} data-slot="section-list-status" data-status={status} aria-hidden>
          <span data-slot="section-list-spinner" />
        </div>
      ) : null}
      {scrollMode ? null : renderPagination?.({ onPageChange: selectPage, onPrefetchPage: prefetchPage })}
    </div>
  );
}
