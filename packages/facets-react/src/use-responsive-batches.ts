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
  /** URLs of batches beyond the prerendered first batch (`batchUrls[0]` corresponds to page 2). */
  readonly batchUrls: readonly string[];
  /** Loader for one batch URL (typically `createIndexLoader` with schema validation). */
  readonly load: (url: string) => Promise<T>;
  /** Media query identifying phone viewports (scroll-loading mode); default `DEFAULT_PHONE_MEDIA`. */
  readonly phoneMedia?: string | undefined;
  /** `IntersectionObserver` root margin for phone scroll-loading; default `'200px'`. */
  readonly rootMargin?: string | undefined;
}

/** What `useResponsiveBatches` returns. */
export interface ResponsiveBatches<T> {
  /** Whether the current viewport matches `phoneMedia`. */
  readonly phone: boolean;
  /** Active desktop page number, starting at 1. */
  readonly page: number;
  /** Loaded batches in order (for phone scroll-loading). */
  readonly loadedScrollBatches: readonly T[];
  /** Active batch for desktop pages `>= 2` (`undefined` on page 1 or while loading). */
  readonly activeDesktopBatch: T | undefined;
  /** Whether phone scroll-loading still has unloaded batches to observe. */
  readonly hasMoreScroll: boolean;
  /** Current network status (`'idle'` or `'loading'`). */
  readonly status: 'idle' | 'loading';
  /** Ref to attach to the scroll sentinel element rendered while `hasMoreScroll || status === 'loading'`. */
  readonly sentinelRef: RefObject<HTMLDivElement | null>;
  /** Switches desktop pagination to `nextPage` (fetching its batch when `>= 2` and not yet cached). */
  readonly selectPage: (nextPage: number) => void;
  /** Prefetches a desktop page's batch (`nextPage >= 2`) without changing `page`. */
  readonly prefetchPage: (nextPage: number) => void;
}

/**
 * Coordinates mobile scroll-loading and desktop pagination over one set of static JSON batch URLs.
 *
 * @param options - Batch URLs beyond the initial page, batch loader, and optional phone media query / root margin.
 * @returns Viewport mode, loaded batches, sentinel ref, status and desktop page controls.
 *
 * @example
 * const batches = useResponsiveBatches({ batchUrls, load: loadSectionBatch });
 */
export function useResponsiveBatches<T>(options: ResponsiveBatchesOptions<T>): ResponsiveBatches<T> {
  const { batchUrls, load, phoneMedia = DEFAULT_PHONE_MEDIA, rootMargin = '200px' } = options;
  const [batches, setBatches] = useState<Readonly<Record<number, T>>>({});
  const [page, setPage] = useState(1);
  const [phone, setPhone] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading'>('idle');
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchBatch = useCallback(
    (batchIndex: number): Promise<T | undefined> => {
      const url = batchUrls[batchIndex];

      if (url === undefined) return Promise.resolve(undefined);

      return load(url)
        .then((items) => {
          setBatches((previous) => (previous[batchIndex] === items ? previous : { ...previous, [batchIndex]: items }));

          return items;
        })
        .catch(() => undefined);
    },
    [batchUrls, load],
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

  const prefetchPage = useCallback(
    (nextPage: number): void => {
      if (nextPage >= 2) void fetchBatch(nextPage - 2);
    },
    [fetchBatch],
  );

  const nextScrollBatch = batchUrls.findIndex((_, index) => batches[index] === undefined);
  const hasMoreScroll = phone && nextScrollBatch !== -1;

  useEffect(() => {
    if (!hasMoreScroll) return;

    const target = sentinelRef.current;

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
      { rootMargin },
    );

    observer.observe(target);

    return () => {
      active = false;
      observer.disconnect();
    };
  }, [hasMoreScroll, nextScrollBatch, fetchBatch, rootMargin]);

  const loadedScrollBatches = useMemo(
    () =>
      batchUrls.flatMap((_, index) => {
        const items = batches[index];

        return items === undefined ? [] : [items];
      }),
    [batchUrls, batches],
  );
  const activeDesktopBatch = page >= 2 ? batches[page - 2] : undefined;

  return {
    phone,
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
