'use client';

/**
 * The React binding of faceted collections, and the History API URL adapter.
 *
 * Key design decisions:
 *     - A thin adapter over the pure engine: it reads the URL, keeps the remembered page, and navigates; every rule
 *       lives in the engine, none in refs or effects.
 *     - Keys only: the app maps them to what it renders (e.g. cards rendered once on the server).
 *     - The router is injected (`UrlAdapter`): the same hook for Next (`@figatellultimate/next16/facets`), the History
 *       API, or memory in tests.
 *
 * Invariants (`hook.test.ts`): the reconciliation replayed through the hook and an in-memory URL; the
 * navigation modes; the URL is the state, the remembered page never in it.
 */
import type { Action, Engine, SelectionState, UrlAdapter, View } from '@figatellultimate/facets';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';

/** What the hook gives a listing: its state and view, how to act, real hrefs, and its sorts. */
export interface FacetedCollectionBinding {
  readonly state: SelectionState;
  readonly view: View;
  /** Applies an action: the URL changes, the remembered page stays in the hook. */
  readonly dispatch: (action: Action) => void;
  /** A real `href` for an action, e.g. pagination links (`?` when the state is the default one). */
  readonly hrefFor: (action: Action) => string;
  /** Loads ahead what an action's navigation would fetch (the URL adapter's `prefetch`), e.g. the next page's. */
  readonly prefetchFor: (action: Action) => void;
  /** The sort registry's names, the default first: what a sort select offers. */
  readonly sorts: readonly string[];
}

type NavigationMode = 'replace' | 'push';

/**
 * How an action navigates: changing page is moving through the list, so Back returns to the previous page;
 * a filter or a sort replaces the entry, so Back leaves the list instead of undoing each click.
 */
const DEFAULT_MODES: Readonly<Record<Action['type'], NavigationMode>> = {
  page: 'push',
  toggle: 'replace',
  clear: 'replace',
  sort: 'replace',
};

const modeOf = (
  option: NavigationMode | Partial<Readonly<Record<Action['type'], NavigationMode>>> | undefined,
  type: Action['type'],
): NavigationMode => (typeof option === 'string' ? option : (option?.[type] ?? DEFAULT_MODES[type]));

/**
 * The React binding of a faceted collection.
 *
 * @param engine - The collection's engine (`defineFacetedCollection`).
 * @param url - Where the state lives: `useNextUrl()` in Next, `useHistoryUrl()` elsewhere, or an in-memory adapter.
 * @param options - `mode`: how actions navigate, for every action or per kind; default `push` for a page change,
 *   `replace` for a filter, a clear or a sort (Back returns to the previous page, but leaves the list instead of
 *   undoing each filter).
 * @returns The state read from the URL, the view (keys only), `dispatch`, `hrefFor`, `prefetchFor` and the sorts. The page
 *   remembered before the first selection is kept here, never in the URL.
 *
 * @example
 * const binding = useFacetedCollection(engine, useNextUrl());
 * return binding.view.keys.map((key) => cards[key]);
 */
export function useFacetedCollection<I>(
  engine: Engine<I>,
  url: UrlAdapter,
  options: { readonly mode?: NavigationMode | Partial<Readonly<Record<Action['type'], NavigationMode>>> } = {},
): FacetedCollectionBinding {
  const option = options.mode;
  const [remembered, setRemembered] = useState<number | undefined>(undefined);
  const read = useMemo(() => engine.read(url.search), [engine, url.search]);
  const state = useMemo<SelectionState>(
    () => (remembered === undefined ? read : { ...read, remembered }),
    [read, remembered],
  );
  const view = useMemo(() => engine.view(state), [engine, state]);
  const dispatch = useCallback(
    (action: Action) => {
      const next = engine.transition(state, action);

      setRemembered(next.state.remembered);
      url.navigate(next.search, { mode: modeOf(option, action.type) });
    },
    [engine, state, url, option],
  );
  // A page change's query string, written at once: whatever the strategy, a page change goes to the page asked for,
  // clamped, and forgets the remembered page (`reconcile.ts`). A transition would order the list twice for it, and a
  // pagination asks for one per page it links to, or lists in an ellipsis' menu.
  const searchOf = useCallback(
    (action: Action): string =>
      action.type === 'page'
        ? engine.write({ facets: state.facets, sort: state.sort, page: Math.min(Math.max(1, action.page), view.pages) })
        : engine.transition(state, action).search,
    [engine, state, view.pages],
  );
  const hrefFor = useCallback(
    (action: Action) => {
      const search = searchOf(action);

      // The adapter's own href when it has one (a listing paginated in its path); else the query, `?` for none.
      return url.href?.(search) ?? (search === '' ? '?' : search);
    },
    [searchOf, url],
  );
  const prefetchFor = useCallback(
    (action: Action) => {
      url.prefetch?.(searchOf(action));
    },
    [searchOf, url],
  );

  return { state, view, dispatch, hrefFor, prefetchFor, sorts: engine.sorts };
}

const subscribe = (onChange: () => void): (() => void) => {
  window.addEventListener('popstate', onChange);

  return () => {
    window.removeEventListener('popstate', onChange);
  };
};
const listeners = new Set<() => void>();
const subscribeAll = (onChange: () => void): (() => void) => {
  listeners.add(onChange);
  const stop = subscribe(onChange);

  return () => {
    listeners.delete(onChange);
    stop();
  };
};

/**
 * The History API URL adapter, for apps without a framework router.
 *
 * @returns An adapter reading `location.search` and writing with `replaceState` or `pushState`: the page never
 *   scrolls, Back works, and every listing of the page follows.
 *
 * @example
 * const binding = useFacetedCollection(engine, useHistoryUrl());
 */
export function useHistoryUrl(): UrlAdapter {
  const search = useSyncExternalStore(
    subscribeAll,
    () => window.location.search,
    () => '',
  );

  return useMemo(
    () => ({
      search,
      navigate(next: string, { mode }: { readonly mode: 'replace' | 'push' }) {
        const target = `${window.location.pathname}${next}${window.location.hash}`;

        if (mode === 'push') window.history.pushState(null, '', target);
        else window.history.replaceState(null, '', target);

        for (const listener of listeners) listener();
      },
    }),
    [search],
  );
}
