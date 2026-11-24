/**
 * Faceted collections: a pure engine that filters keyed items by N facets, sorts them with an injected registry,
 * paginates them and reconciles the page after each change, with its whole state in the URL.
 *
 * Architecture:
 *     defineFacetedCollection(definition) ──> Engine<I>
 *         ├─ read(search)              URL ──> SelectionState      (total: never throws)
 *         ├─ write(state)              SelectionState ──> URL      (canonical)
 *         ├─ view(state)               SelectionState ──> View     (keys, total, pages, counts)
 *         └─ transition(state, action) SelectionState ──> { state, search }
 *                                         └─ reconcile(...) picks the page (reconcile.ts)
 *
 *     Layers, each in its own package:
 *     engine and codec (here, pure) ──> URL adapter (History API, Next) ──> React binding ──> unstyled components
 *
 * Key design decisions:
 *     - Keys only: the engine handles items and their keys, never rendered elements, routers or frameworks. The app
 *       maps keys to what it renders (e.g. cards rendered once on the server, reordered on the client).
 *     - The URL is the state: one repeated query parameter per selected value
 *       (`?tags=bot&tags=release&sort=date-asc&page=2`); page 1, the default sort and empty facets are not written.
 *       No separator, so no term key can break decoding.
 *     - Facet values are term keys, never numeric ids: adding or renaming a term never changes what an existing URL
 *       means (an id taken from a sorted list would).
 *     - Within a facet, `any` (default) or `all`; across facets, always AND.
 *     - The values a view allows are the ones present in its items: anything else in a URL is dropped on reading.
 *     - Indexes (facet → value → keys) are built once per engine: from precomputed ones when given, restricted to
 *       the view's items, from the items otherwise. A listing passes its own items, never a whole site's index.
 *     - The page after a filter, a clear or a sort is an injected strategy (`reconcile`), `keepReadingPosition` by
 *       default; a page change is the engine's own, the page asked for, so that no strategy can break a pagination.
 *     - Counts in one pass over the items, each adding to its own values (items × their values, never items × every
 *       value: a facet of hundreds of values on thousands of items once took a third of a second a view); a transition
 *       reads the visible keys without them.
 *     - The page remembered before the first selection belongs to the state, never to the URL: a shared link stays
 *       canonical and carries no personal navigation detail.
 *
 * Invariants:
 *     - Reading a URL is total: forged, truncated, malformed or huge inputs give a valid state
 *       (`engine.test.ts`: a seeded batch of random strings).
 *     - `read(write(state))` is the state, and `write` is canonical (`engine.test.ts`).
 *     - Adding a term never changes an existing URL's meaning (`engine.test.ts`).
 *     - Each value's count is what the view would hold with it checked too, the other facets applied, in `any` and
 *       `all` alike (`engine.test.ts`: a property against that definition, one value at a time).
 *     - Transitions replay `keepReadingPosition`'s table and never mutate their input (`transitions.test.ts`).
 *     - No framework, router, DOM or Node type (the `runtime` role's boundary rules).
 *
 * Limitations:
 *     - Counts are computed on every view, one filtering pass per facet: fine for a listing page, not for tens of
 *       thousands of items.
 */
import { readFacets, readPage, readSort, writeState } from './codec.js';
import { keepReadingPosition } from './reconcile.js';
import type { Action, Engine, FacetedCollection, SelectionState, View } from './types.js';

export {
  paginationItems,
  responsivePaginationItems,
  type PaginationInput,
  type PaginationItem,
  type ResponsivePaginationItem,
} from './pagination.js';
export { isDefaultView, pagedHref, pagedSearch } from './paged.js';
export { PAGES_PER_BATCH, batchPath, batchStart, batchesOf } from './batches.js';
export { readPage } from './codec.js';
export { backToFirstPage, keepReadingPosition } from './reconcile.js';
export type {
  Action,
  Engine,
  FacetDefinition,
  FacetedCollection,
  Reconcile,
  ReconcileInput,
  SelectionState,
  UrlAdapter,
  View,
} from './types.js';

/**
 * Builds the engine of a faceted collection.
 *
 * The value sets are built here, once: from `definition.indexes` when given (restricted to the view's items), from
 * the items otherwise; every later call reuses them.
 *
 * @param definition - The items and their key, the facets, the sort registry (its first sort is the default), the
 *   page size, and optionally a reconciliation strategy and precomputed indexes.
 * @returns A frozen engine: `read`, `write`, `view`, `transition`, its items and its sorts' names.
 *
 * @example
 * const engine = defineFacetedCollection({
 *   items: posts,
 *   key: (post) => post.url,
 *   facets: { tags: { values: (post) => post.tags }, authors: { values: (post) => post.authors, mode: 'all' } },
 *   sorts: { 'date-desc': byDateDesc, 'date-asc': byDateAsc },
 *   perPage: 5,
 * });
 * const state = engine.read('?tags=bot&page=2');
 * const { keys, pages, counts } = engine.view(state);
 * const { state: next, search } = engine.transition(state, { type: 'toggle', facet: 'tags', value: 'guide' });
 */
export function defineFacetedCollection<I>(definition: FacetedCollection<I>): Engine<I> {
  const { items, key, perPage } = definition;
  const facetNames = Object.keys(definition.facets);
  const sortNames = Object.keys(definition.sorts);
  const defaultSort = sortNames[0] ?? '';
  const reconcile = definition.reconcile ?? keepReadingPosition;
  const keys = items.map(key);
  const pairs = items.map((item, index) => ({ key: keys[index] ?? '', item }));

  // facet → value → keys of this view; the allowed values are the ones present in the view: a URL is sanitized by them.
  const members = new Map<string, Map<string, Set<string>>>();

  for (const facet of facetNames) {
    const byValue = new Map<string, Set<string>>();
    const precomputed = definition.indexes?.[facet];

    if (precomputed !== undefined) {
      const inView = new Set(keys);

      for (const [value, entries] of Object.entries(precomputed)) {
        const present = new Set(entries.filter((entry) => inView.has(entry)));

        if (present.size > 0) byValue.set(value, present);
      }
    } else {
      items.forEach((item, index) => {
        for (const value of definition.facets[facet]?.values(item) ?? []) {
          const set = byValue.get(value) ?? new Set<string>();

          set.add(keys[index] ?? '');
          byValue.set(value, set);
        }
      });
    }

    members.set(facet, byValue);
  }

  const allowed = new Map<string, ReadonlySet<string>>(
    [...members].map(([facet, byValue]) => [facet, new Set(byValue.keys())]),
  );
  // Each item's values, per facet, from the same index (generated or computed): the counts read an item's own values
  // instead of testing every value against every item.
  const valuesOf = new Map<string, ReadonlyMap<string, readonly string[]>>(
    [...members].map(([facet, byValue]) => {
      const byKey = new Map<string, string[]>();

      for (const [value, keys] of byValue)
        for (const key of keys) {
          const values = byKey.get(key);

          if (values === undefined) byKey.set(key, [value]);
          else values.push(value);
        }

      return [facet, byKey];
    }),
  );

  /** Whether an item passes a facet's selection (no selection passes). */
  const passes = (itemKey: string, facet: string, selected: readonly string[]): boolean => {
    if (selected.length === 0) return true;

    const byValue = members.get(facet);
    const has = (value: string): boolean => byValue?.get(value)?.has(itemKey) === true;

    return definition.facets[facet]?.mode === 'all' ? selected.every(has) : selected.some(has);
  };

  /** Every key passing the selection's other facets than `ignoring`, unsorted: what a facet's counts range over. */
  const passing = (state: SelectionState, ignoring: string): string[] =>
    pairs.flatMap((pair) =>
      facetNames.every((facet) => facet === ignoring || passes(pair.key, facet, state.facets[facet] ?? []))
        ? [pair.key]
        : [],
    );

  /** Every key passing the selection, sorted by the state's comparator. */
  const order = (state: SelectionState): string[] => {
    const filtered = pairs.filter((pair) =>
      facetNames.every((facet) => passes(pair.key, facet, state.facets[facet] ?? [])),
    );
    const compare = definition.sorts[state.sort] ?? definition.sorts[defaultSort];

    // Stable: equal items keep their natural order.
    if (compare !== undefined) filtered.sort((a, b) => compare(a.item, b.item));

    return filtered.map((pair) => pair.key);
  };

  const pagesOf = (count: number): number => Math.max(1, Math.ceil(count / perPage));
  const sliceOf = (sorted: readonly string[], page: number): string[] =>
    sorted.slice((page - 1) * perPage, page * perPage);

  const view = (state: SelectionState): View => {
    const sorted = order(state);
    const pages = pagesOf(sorted.length);
    const page = Math.min(Math.max(1, state.page), pages);
    // Per value, what the view would hold with that value checked too, which is how a reader reads a count ("what do I
    // get if I click"): the other facets applied, this facet's selection with the value added (a union for `any`, an
    // intersection for `all`); a checked value gives the current total.
    //
    // One pass over those items, each one adding to its own values (items × their values, not items × every value). With
    // P the items already passing this facet's selection: `any`, an item passes with a value when it passes or has it,
    // so a value counts P and the items outside P that have it; `all`, an item passes when it passes and has it, so a
    // value counts the items of P that have it. With nothing selected, P is empty for `any` (a value counts its items)
    // and every item for `all` (the same).
    const counts = Object.fromEntries(
      facetNames.map((facet) => {
        const selected = state.facets[facet] ?? [];
        const all = definition.facets[facet]?.mode === 'all';
        const own = valuesOf.get(facet);
        const tally = new Map<string, number>([...(members.get(facet)?.keys() ?? [])].map((value) => [value, 0]));
        let base = 0;

        for (const key of passing(state, facet)) {
          const inSelection = selected.length > 0 && passes(key, facet, selected);

          if (!all && inSelection) {
            base += 1;
            continue;
          }

          if (all && selected.length > 0 && !inSelection) continue;

          for (const value of own?.get(key) ?? []) tally.set(value, (tally.get(value) ?? 0) + 1);
        }

        return [facet, Object.freeze(Object.fromEntries([...tally].map(([value, count]) => [value, count + base])))];
      }),
    );

    return Object.freeze({
      keys: Object.freeze(sliceOf(sorted, page)),
      total: sorted.length,
      pages,
      counts: Object.freeze(counts),
    });
  };

  const engine: Engine<I> = {
    items,
    sorts: Object.freeze([...sortNames]),
    read(search) {
      const facets = readFacets(search, allowed);
      const sort = readSort(search, sortNames);
      const pages = pagesOf(order({ facets, sort, page: 1 }).length);

      return Object.freeze({ facets: Object.freeze(facets), sort, page: Math.min(readPage(search), pages) });
    },
    write(state) {
      return writeState(state, facetNames, defaultSort);
    },
    view,
    transition(state, action: Action) {
      const facets = { ...state.facets };
      let sort = state.sort;

      if (action.type === 'toggle' && allowed.get(action.facet)?.has(action.value) === true) {
        const current = facets[action.facet] ?? [];

        facets[action.facet] = current.includes(action.value)
          ? current.filter((value) => value !== action.value)
          : [...current, action.value].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      } else if (action.type === 'clear') {
        for (const facet of facetNames) if (action.facet === undefined || action.facet === facet) facets[facet] = [];
      } else if (action.type === 'sort' && sortNames.includes(action.sort)) {
        sort = action.sort;
      }

      // A page change, the engine's own: the page asked for, clamped; the remembered page kept while no selection
      // asks for it (as `keepReadingPosition` keeps it), whatever the strategy, which only decides filters and sorts.
      if (action.type === 'page') {
        const selected = Object.values(state.facets).some((values) => values.length > 0);
        const paged: SelectionState = Object.freeze({
          facets: state.facets,
          sort: state.sort,
          page: Math.min(Math.max(1, Math.trunc(action.page)), pagesOf(order(state).length)),
          ...(selected || state.remembered === undefined ? {} : { remembered: state.remembered }),
        });

        return { state: paged, search: writeState(paged, facetNames, defaultSort) };
      }

      const after: SelectionState = { facets, sort, page: state.page };
      // The visible slice before, without the view's counts (a count per facet value, the whole list filtered for
      // each): a transition only needs its keys. The order after, once.
      const before = order(state);
      const nextOrder = order(after);
      const { page, remembered } = reconcile({
        before: state,
        after,
        action,
        previousKeys: sliceOf(before, Math.min(Math.max(1, state.page), pagesOf(before.length))),
        nextOrder,
        perPage,
      });
      const next: SelectionState = Object.freeze({
        facets: Object.freeze(facets),
        sort,
        page: Math.min(Math.max(1, page), pagesOf(nextOrder.length)),
        ...(remembered === undefined ? {} : { remembered }),
      });

      return { state: next, search: writeState(next, facetNames, defaultSort) };
    },
  };

  return Object.freeze(engine);
}
