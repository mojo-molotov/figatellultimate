'use client';

/**
 * Responsive batch loader for static lists whose first batch is prerendered in HTML:
 *
 *     batchUrls (batch 1, 2, …) ──> useResponsiveBatches({ batchUrls, load })
 *         ├─ phone (`max-width: 36rem`): IntersectionObserver on `sentinelRef` appends batches on scroll
 *         └─ desktop (`> 36rem`): observer stays off; `selectPage` and `prefetchPage` drive classic pagination
 *
 * Key design decisions:
 *     - Same static HTML for every device (no `User-Agent` detection): `phone` starts `false` during SSR/hydration so
 *       desktop never triggers scroll-loading on arrival, then syncs with `window.matchMedia(phoneMedia)`.
 *     - Shared batch cache across both modes: a batch loaded while paging on desktop is reused if the viewport shrinks,
 *       and vice versa; relies on the caller's `load` (typically `createIndexLoader`) to deduplicate requests and retry
 *       failed fetches.
 *
 * Invariants (`use-responsive-batches.test.tsx`): observer inactive on desktop; `selectPage(2)` loads batch 0 and
 * exposes it as `activeDesktopBatch`; `prefetchPage(2)` caches batch 0 without changing `page`; on phone viewports
 * intersecting the sentinel appends batches sequentially until `hasMoreScroll` turns `false`.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

/** Default phone breakpoint matching `@figatellultimate/themes/base.css`. */
export const DEFAULT_PHONE_MEDIA = '(max-width: 36rem)';

/** Options of `useResponsiveBatches`. */
export interface ResponsiveBatchesOptions<T> {
  /** URLs of batches beyond page 1 (`batchUrls[0]` corresponds to page 2). */
  readonly batchUrls: readonly string[];
  /** Loader for one batch URL (typically `createIndexLoader` with schema validation). */
  readonly load: (url: string) => Promise<T>;
  /** 1-based page number already prerendered in initial HTML; default `1`. Pages `>= 2` stay paginated on phones. */
  readonly initialPage?: number | undefined;
  /** Static JSON URL for page 1, used when `initialPage > 1` and the reader navigates back to page 1. */
  readonly firstBatchUrl?: string | undefined;
  /** Media query identifying phone viewports (scroll-loading mode); default `DEFAULT_PHONE_MEDIA`. */
  readonly phoneMedia?: string | undefined;
  /** `IntersectionObserver` root margin for phone scroll-loading; default `'200px'`. */
  readonly rootMargin?: string | undefined;
}

/** What `useResponsiveBatches` returns. */
export interface ResponsiveBatches<T> {
  /** Whether the current viewport matches `phoneMedia`. */
  readonly phone: boolean;
  /** Whether scroll-loading mode is active (`phone && initialPage === 1 && batchUrls.length > 0`). */
  readonly scrollMode: boolean;
  /** Active page number, starting at `initialPage`. */
  readonly page: number;
  /** Loaded batches in order (for phone scroll-loading). */
  readonly loadedScrollBatches: readonly T[];
  /** Active batch when `page !== initialPage` (`undefined` on `initialPage` or while loading). */
  readonly activeDesktopBatch: T | undefined;
  /** Whether phone scroll-loading still has unloaded batches to observe. */
  readonly hasMoreScroll: boolean;
  /** Current network status (`'idle'` or `'loading'`). */
  readonly status: 'idle' | 'loading';
  /** Ref to attach to the scroll sentinel element rendered while `hasMoreScroll || status === 'loading'`. */
  readonly sentinelRef: RefObject<HTMLDivElement | null>;
  /** Switches pagination to `nextPage` (fetching its batch when `nextPage !== initialPage` and not yet cached). */
  readonly selectPage: (nextPage: number) => void;
  /** Prefetches a page's batch (`nextPage !== initialPage`) without changing `page`. */
  readonly prefetchPage: (nextPage: number) => void;
}

/**
 * Coordinates mobile scroll-loading and desktop pagination over one set of static JSON batch URLs.
 *
 * @param options - Batch URLs beyond page 1, batch loader, and optional initial page, first batch URL, phone media
 *   query and root margin.
 * @returns Viewport mode, loaded batches, sentinel ref, status and page controls.
 *
 * @example
 * const batches = useResponsiveBatches({ batchUrls, load: loadSectionBatch });
 */
export function useResponsiveBatches<T>(options: ResponsiveBatchesOptions<T>): ResponsiveBatches<T> {
  const {
    batchUrls,
    load,
    initialPage = 1,
    firstBatchUrl,
    phoneMedia = DEFAULT_PHONE_MEDIA,
    rootMargin = '200px',
  } = options;
  // Keyed by 1-based page number so page 1 (`firstBatchUrl`) and pages 2..N (`batchUrls`) share one cache.
  const [batches, setBatches] = useState<Readonly<Record<number, T>>>({});
  const [page, setPage] = useState(initialPage);
  const [phone, setPhone] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading'>('idle');
  const sentinelRef = useRef<HTMLDivElement>(null);

  const urlForPage = useCallback(
    (targetPage: number): string | undefined => (targetPage === 1 ? firstBatchUrl : batchUrls[targetPage - 2]),
    [batchUrls, firstBatchUrl],
  );

  const fetchPage = useCallback(
    (targetPage: number): Promise<T | undefined> => {
      const url = urlForPage(targetPage);

      if (url === undefined) return Promise.resolve(undefined);

      return load(url)
        .then((items) => {
          setBatches((previous) => (previous[targetPage] === items ? previous : { ...previous, [targetPage]: items }));

          return items;
        })
        .catch(() => undefined);
    },
    [urlForPage, load],
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia(phoneMedia);
    const update = (): void => {
      setPhone(query.matches);
    };

    update();
    query.addEventListener('change', update);

    return () => {
      query.removeEventListener('change', update);
    };
  }, [phoneMedia]);

  const selectPage = useCallback(
    (nextPage: number): void => {
      setPage(nextPage);

      if (nextPage === initialPage) return;

      if (batches[nextPage] !== undefined) return;

      setStatus('loading');
      void fetchPage(nextPage).finally(() => {
        setStatus('idle');
      });
    },
    [batches, fetchPage, initialPage],
  );

  const prefetchPage = useCallback(
    (nextPage: number): void => {
      if (nextPage === initialPage) return;

      // Never prefetch desktop pages on a phone viewport in scroll mode, where batches are revealed on scroll only.
      if (initialPage === 1 && typeof window.matchMedia === 'function' && window.matchMedia(phoneMedia).matches) return;

      const url = urlForPage(nextPage);

      if (url !== undefined) void load(url).catch(() => undefined);
    },
    [initialPage, urlForPage, load, phoneMedia],
  );

  const scrollMode = phone && initialPage === 1 && batchUrls.length > 0;
  const nextScrollIndex = batchUrls.findIndex((_, index) => batches[index + 2] === undefined);
  const hasMoreScroll = scrollMode && nextScrollIndex !== -1;

  useEffect(() => {
    if (!hasMoreScroll) return;

    const target = sentinelRef.current;

    if (target === null || typeof IntersectionObserver === 'undefined') return;

    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;

        setStatus('loading');
        void fetchPage(nextScrollIndex + 2).finally(() => {
          if (active) setStatus('idle');
        });
      },
      { rootMargin },
    );

    observer.observe(target);

    return () => {
      active = false;
      observer.disconnect();
    };
  }, [hasMoreScroll, nextScrollIndex, fetchPage, rootMargin]);

  const loadedScrollBatches = useMemo(
    () =>
      batchUrls.flatMap((_, index) => {
        const items = batches[index + 2];

        return items === undefined ? [] : [items];
      }),
    [batchUrls, batches],
  );
  const activeDesktopBatch = page === initialPage ? undefined : batches[page];

  return {
    phone,
    scrollMode,
    page,
    loadedScrollBatches,
    activeDesktopBatch,
    hasMoreScroll,
    status,
    sentinelRef,
    selectPage,
    prefetchPage,
  };
}
