'use client';

/**
 * A faceted collection paginated in its path, its index loaded on demand: a page holds its own slice only (each
 * default page prerendered at its own URL), and the browser loads every item (the index) for the first selection or
 * sort. The binding is the same whichever is at hand, so the components never know.
 *
 *     the page's slice ──> static binding (the slice's keys, the server's pages and total)
 *         │                    a page ──> its batch at hand: shown here, the address alone moves (`local`)
 *         │                               otherwise: the URL, another prerendered page from the server
 *         │                    any other action ──> pending
 *         │ batches (`batches`): the current page's on idle, the next or previous one near its edges
 *         │ a selection or a sort in the URL, a pending action, or `prefetch` (the reader heads for a filter)
 *         ▼
 *     load() ──> the index ──> the engine over every item ──> the live binding; the pending action applied
 *
 * Key design decisions:
 *     - The index only when needed: a default page shows what the server rendered, and reaches the other default
 *       pages by the URL alone, which a build prerenders.
 *     - A selection is read from the URL itself (`isDefaultView`), never from the engine's state: before the index,
 *       the engine holds the page's own items alone, and would drop a term none of them has.
 *     - While the index loads for a selection: no card and a single page, never the unselected list's pages, whose
 *       links would leave the selection.
 *     - An action chosen before the index waits for it, then applies: a click is never lost.
 *     - A failed load is a value (`error`): the page's slice stays, and the next `prefetch` loads again.
 *     - Batches, as chosen with the user, rather than the whole index on idle: the pages around the reader, ten a small
 *       file, whatever the list's length (the index is ~42 bytes gzip a post: a megabyte at 27,000 posts). A page its
 *       batch holds is shown here at once; any other through the server, as without batches; a failed batch leaves its
 *       pages to the server and is loaded again on the next approach.
 *     - The page is the address's, never the props': a page shown here leaves the props on the landed one. An address
 *       they do not hold (a history entry Next restores with the landed page's tree) loads its batch at once, or,
 *       without batches, goes back to the server.
 *     - Once the whole index is here, every default page is shown here: only the address moves, nothing loaded ahead.
 *     - Without `paged`, every item is at hand: the live binding at once, nothing loaded.
 *     - Without `load`, no index (a folder of folders, nothing to filter): its pages from the server or its batches, a
 *       query in its URL read as its default view.
 *
 * Invariants (`use-paged-collection.test.tsx`): every item at hand, never loaded; the slice and the server's pages
 * without loading; another default page by the URL alone; the index for a selection in the URL, a term the slice
 * lacks included; an action kept until the index, then applied; a single prefetch; a failed load as a value, loaded
 * again; the loader fetching each URL once, an error status or a bad body rejected and fetched again; the current
 * page's batch on idle, the next near its edge; a page a batch holds shown without the server, any other through it;
 * no page a batch holds loaded ahead; a restored address's batch at once, or the server without batches; every page
 * shown here once the index is at hand; without an index, its pages from its batches, a query read as the default view.
 */
import {
  isDefaultView,
  PAGES_PER_BATCH,
  readPage,
  batchStart,
  type Action,
  type Engine,
  type UrlAdapter,
} from '@figatellultimate/facets';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useFacetedCollection, type FacetedCollectionBinding } from './use-faceted-collection.js';

/** A page of a collection paginated in its path, as the server knows it. */
export interface PagedSlice {
  /** The page's number, from 1. */
  readonly page: number;
  /** The default view's count of pages. */
  readonly pages: number;
  /** The default view's count of items. */
  readonly total: number;
  /** Items per page: where each page's keys lie in a batch. Needed with `batches`. */
  readonly perPage?: number | undefined;
}

/** A batch as `usePagedCollection` reads it: its pages' keys in the default order, from its first page on. */
export interface Batch {
  readonly keys: readonly string[];
}

/** The batches of a collection paginated in its path (`batchesOf` of `@figatellultimate/facets`, `listingIndexRoute`'s `pages`). */
export interface PagedBatches<S extends Batch> {
  /** Loads the batch starting at a page (`batchStart`): a stable function, e.g. `createIndexLoader` on its URL. */
  readonly load: (from: number) => Promise<S>;
  /** Pages per batch, as the route builds them; default `PAGES_PER_BATCH`. */
  readonly size?: number | undefined;
}

/** What `usePagedCollection` takes. */
export interface PagedCollectionOptions<
  T,
  I extends { readonly items: readonly T[] } = { readonly items: readonly T[] },
  S extends Batch = Batch,
> {
  /** The engine over some items: a stable function (at module scope, or memoized). */
  readonly engine: (items: readonly T[]) => Engine<T>;
  /** The page's own items when `paged`; every item otherwise. */
  readonly items: readonly T[];
  /** The page of a collection paginated in its path; without it, every item is at hand. */
  readonly paged?: PagedSlice | undefined;
  /**
   * Loads the index, every item and whatever else the app needs (its cards): a stable function. None for a collection
   * with nothing to filter (e.g. a folder of folders): a query in its URL is read as its default view.
   */
  readonly load?: (() => Promise<I>) | undefined;
  /** The URL adapter, e.g. `useNextUrl({ first })`. */
  readonly url: UrlAdapter;
  /**
   * The listing's batches: loaded on idle around the current page, its pages then shown in the browser (only the
   * address moves); none without it, each page reached through the server.
   */
  readonly batches?: PagedBatches<S> | undefined;
}

/** What `usePagedCollection` gives. */
export interface PagedCollection<I, S extends Batch = Batch> {
  /** The binding for the components, the same whether the index is at hand or not. */
  readonly binding: FacetedCollectionBinding;
  /** The index, once loaded. */
  readonly index: I | undefined;
  /** Loads the index ahead (e.g. as the pointer reaches the filters); once only. */
  readonly prefetch: () => void;
  /** The last load's failure, until the next one. */
  readonly error: unknown;
  /** The batches loaded so far, in no order: what the app shows a page's cards from. */
  readonly batches: readonly S[];
}

/** How close to a batch's edge the next one is loaded: a reader moving on never reaches an unloaded page. */
const BATCH_MARGIN = 3;

/** After the page's own work: `requestIdleCallback` where there is one, a short delay elsewhere. */
function whenIdle(run: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(run);

    return () => {
      cancelIdleCallback(handle);
    };
  }

  const handle = setTimeout(run, 200);

  return () => {
    clearTimeout(handle);
  };
}

/**
 * A faceted collection paginated in its path, its index loaded on demand.
 *
 * @param options - The engine's factory, the page's items, the page (`paged`), the index's loader and the URL adapter.
 * @returns The binding, the index once loaded, `prefetch` and the last load's failure.
 *
 * @example
 * const { binding, index, prefetch } = usePagedCollection({
 *   engine: postsEngine, items, paged: { page, pages, total }, load, url: useNextUrl({ first }),
 * });
 */
export function usePagedCollection<
  T,
  I extends { readonly items: readonly T[] } = { readonly items: readonly T[] },
  S extends Batch = Batch,
>(options: PagedCollectionOptions<T, I, S>): PagedCollection<I, S> {
  const { engine: engineOf, items, paged, load, url, batches: batched } = options;
  const size = batched?.size ?? PAGES_PER_BATCH;
  const perPage = paged?.perPage;
  // The batches at hand, by first page, and those on their way.
  const [batches, setBatches] = useState<ReadonlyMap<number, S>>(() => new Map());
  const asked = useRef(new Set<number>());
  const loadBatch = useCallback(
    (from: number): void => {
      if (batched === undefined || paged === undefined || from < 1 || from > paged.pages || asked.current.has(from))
        return;

      asked.current.add(from);
      batched.load(from).then(
        (batch) => {
          setBatches((known) => new Map([...known, [from, batch]]));
        },
        () => {
          // Loaded again on the next approach: a failed batch leaves its pages to the server.
          asked.current.delete(from);
        },
      );
    },
    [batched, paged],
  );
  // A page's keys from its batch, when it is at hand.
  const batchKeys = useCallback(
    (page: number): readonly string[] | undefined => {
      const from = batchStart(page, size);
      const batch = batches.get(from);

      if (batch === undefined || perPage === undefined) return undefined;

      return batch.keys.slice((page - from) * perPage, (page - from + 1) * perPage);
    },
    [batches, size, perPage],
  );
  const [index, setIndex] = useState<I | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  // An action chosen before the index, applied once it is here.
  const pending = useRef<Action | undefined>(undefined);
  const loading = useRef(false);
  const prefetch = useCallback(() => {
    if (paged === undefined || load === undefined || index !== undefined || loading.current) return;

    loading.current = true;
    setError(undefined);
    load()
      .then(setIndex, setError)
      .finally(() => {
        loading.current = false;
      });
  }, [paged, index, load]);
  const all = index?.items ?? items;
  const engine = useMemo(() => engineOf(all), [engineOf, all]);
  // Every item at hand: any default page is shown here, only the address moves, nothing loaded ahead.
  const everywhere = useMemo(
    (): UrlAdapter => ({
      search: url.search,
      navigate: (next, navigation) => {
        url.navigate(next, { ...navigation, local: true });
      },
      ...(url.href === undefined ? {} : { href: (next: string) => url.href?.(next) ?? next }),
    }),
    [url],
  );
  const live = useFacetedCollection(engine, everywhere);
  // Without an index, nothing to select: a query it never writes is read as the default view.
  const selecting = load !== undefined && !isDefaultView(url.search);
  // The page the address shows: a page shown here moves the address, never the server's props.
  const current = paged === undefined ? 1 : readPage(url.search);

  // The current page's batch on idle, then, as the reader moves, the next or previous one near its edges.
  useEffect(() => {
    if (batched === undefined || paged === undefined || selecting) return undefined;

    const from = batchStart(current, size);
    const near = (): void => {
      loadBatch(from);

      if (current + BATCH_MARGIN > from + size - 1) loadBatch(from + size);

      if (current - BATCH_MARGIN < from) loadBatch(from - size);
    };

    // The landed page waits for idle; a page the address reached that its props do not hold, at once.
    if (current === paged.page) return whenIdle(near);

    near();

    return undefined;
  }, [batched, paged, selecting, current, size, loadBatch]);

  // An address the props do not hold and no batch can show (a restored history entry, without batches): the server's.
  useEffect(() => {
    if (paged === undefined || index !== undefined || selecting || current === paged.page || batched !== undefined)
      return;

    url.navigate(engine.write({ facets: {}, sort: engine.sorts[0] ?? '', page: current }), { mode: 'replace' });
  }, [paged, index, selecting, current, batched, url, engine]);

  useEffect(() => {
    if (selecting) prefetch();
  }, [selecting, prefetch]);

  // The live binding, over every item, applies the waiting action.
  useEffect(() => {
    const action = pending.current;

    if (index === undefined || action === undefined) return;

    pending.current = undefined;
    live.dispatch(action);
  }, [index, live]);

  const binding = useMemo((): FacetedCollectionBinding => {
    if (paged === undefined || index !== undefined) return live;

    const sort = engine.sorts[0] ?? '';
    const searchOf = (page: number): string => engine.write({ facets: {}, sort, page });

    // The page the props hold: the slice, in the server's order; another one, from its batch (none yet: no card).
    const keys = current === paged.page ? engine.view({ facets: {}, sort, page: 1 }).keys : (batchKeys(current) ?? []);

    return {
      state: { facets: {}, sort, page: current },
      view: {
        // A selection waits for the index: no card, and no page of the unselected list to reach. Before the index, the
        // engine holds the slice alone: its first default page is the slice, in the server's order.
        keys: selecting ? [] : keys,
        total: paged.total,
        pages: selecting ? 1 : paged.pages,
        counts: {},
      },
      dispatch: (action) => {
        // A page its batch holds is shown here, only the address moves; any other, the server's prerendered page.
        if (action.type === 'page')
          url.navigate(searchOf(action.page), {
            mode: 'push',
            local: action.page === paged.page || batchKeys(action.page) !== undefined,
          });
        else {
          pending.current = action;
          prefetch();
        }
      },
      hrefFor: (action) => {
        if (action.type !== 'page') return '?';

        const search = searchOf(action.page);

        return url.href?.(search) ?? (search === '' ? '?' : search);
      },
      // A prerendered page loaded ahead, unless its batch shows it; a selection has nothing to load but the index.
      prefetchFor: (action) => {
        if (action.type === 'page' && action.page !== paged.page && batchKeys(action.page) === undefined)
          url.prefetch?.(searchOf(action.page));
      },
      sorts: engine.sorts,
    };
  }, [paged, index, live, engine, selecting, url, prefetch, current, batchKeys]);
  const loaded = useMemo(() => [...batches.values()], [batches]);

  return { binding, index, prefetch, error, batches: loaded };
}

/**
 * A loader of indexes: each URL fetched once, its body checked before it is read.
 *
 * @param parse - Checks the JSON body and returns the index (e.g. a schema's parse); throws when it does not match.
 * @param seams - Injection seam for tests: `fetch`. Not an API.
 * @returns A function loading an index by its URL; a failed load (an error status, a body `parse` rejects) is
 *   fetched again next time.
 *
 * @example
 * const loadIndex = createIndexLoader((json) => v.parse(Index, json));
 * const index = await loadIndex('/listing/news');
 */
export function createIndexLoader<I>(
  parse: (json: unknown) => I,
  seams: { readonly fetch?: (url: string) => Promise<Response> } = {},
): (url: string) => Promise<I> {
  const fetchOf = seams.fetch ?? ((url: string) => fetch(url));
  const loaded = new Map<string, Promise<I>>();

  return (url) => {
    const known = loaded.get(url);

    if (known !== undefined) return known;

    const index = fetchOf(url).then(async (response) => {
      if (!response.ok) throw new Error(`${url}: the index answered ${String(response.status)}.`);

      return parse(await response.json());
    });

    loaded.set(url, index);
    index.catch(() => {
      loaded.delete(url);
    });

    return index;
  };
}
