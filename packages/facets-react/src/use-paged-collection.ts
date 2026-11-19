'use client';

/**
 * A faceted collection paginated in its path, its index loaded on demand: a page holds its own slice only (each
 * default page prerendered at its own URL), and the browser loads every item (the index) for the first selection or
 * sort. The binding is the same whichever is at hand, so the components never know.
 *
 *     the page's slice ──> static binding (the slice's keys, the server's pages and total)
 *         │                    a page ──> the URL (another prerendered page); any other action ──> pending
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
 *     - Without `paged`, every item is at hand: the live binding at once, nothing loaded.
 *
 * Invariants (`use-paged-collection.test.tsx`): every item at hand, never loaded; the slice and the server's pages
 * without loading; another default page by the URL alone; the index for a selection in the URL, a term the slice
 * lacks included; an action kept until the index, then applied; a single prefetch; a failed load as a value, loaded
 * again; the loader fetching each URL once, an error status or a bad body rejected and fetched again.
 */
import { isDefaultView, type Action, type Engine, type UrlAdapter } from '@figatellultimate/facets';
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
}

/** What `usePagedCollection` takes. */
export interface PagedCollectionOptions<T, I extends { readonly items: readonly T[] }> {
  /** The engine over some items: a stable function (at module scope, or memoized). */
  readonly engine: (items: readonly T[]) => Engine<T>;
  /** The page's own items when `paged`; every item otherwise. */
  readonly items: readonly T[];
  /** The page of a collection paginated in its path; without it, every item is at hand. */
  readonly paged?: PagedSlice | undefined;
  /** Loads the index, every item and whatever else the app needs (its cards): a stable function. */
  readonly load: () => Promise<I>;
  /** The URL adapter, e.g. `useNextUrl({ first })`. */
  readonly url: UrlAdapter;
}

/** What `usePagedCollection` gives. */
export interface PagedCollection<I> {
  /** The binding for the components, the same whether the index is at hand or not. */
  readonly binding: FacetedCollectionBinding;
  /** The index, once loaded. */
  readonly index: I | undefined;
  /** Loads the index ahead (e.g. as the pointer reaches the filters); once only. */
  readonly prefetch: () => void;
  /** The last load's failure, until the next one. */
  readonly error: unknown;
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
export function usePagedCollection<T, I extends { readonly items: readonly T[] }>(
  options: PagedCollectionOptions<T, I>,
): PagedCollection<I> {
  const { engine: engineOf, items, paged, load, url } = options;
  const [index, setIndex] = useState<I | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  // An action chosen before the index, applied once it is here.
  const pending = useRef<Action | undefined>(undefined);
  const loading = useRef(false);
  const prefetch = useCallback(() => {
    if (paged === undefined || index !== undefined || loading.current) return;

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
  const live = useFacetedCollection(engine, url);
  const selecting = !isDefaultView(url.search);

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

    return {
      state: { facets: {}, sort, page: paged.page },
      view: {
        // A selection waits for the index: no card, and no page of the unselected list to reach. Before the index, the
        // engine holds the slice alone: its first default page is the slice, in the server's order.
        keys: selecting ? [] : engine.view({ facets: {}, sort, page: 1 }).keys,
        total: paged.total,
        pages: selecting ? 1 : paged.pages,
        counts: {},
      },
      dispatch: (action) => {
        if (action.type === 'page') url.navigate(searchOf(action.page), { mode: 'push' });
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
      sorts: engine.sorts,
    };
  }, [paged, index, live, engine, selecting, url, prefetch]);

  return { binding, index, prefetch, error };
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
