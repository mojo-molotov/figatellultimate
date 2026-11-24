/**
 * The faceted engine's types: what a collection declares, the selection state, the actions, the view, the URL adapter
 * and the reconciliation contract.
 *
 * Type flow:
 *     FacetedCollection<I> ──> defineFacetedCollection ──> Engine<I>
 *                                                             │
 *     search ──read──> SelectionState ──view──> View          │
 *                          │                                  │
 *                          └──transition(Action)──> { state, search }
 *                                    └─ Reconcile(ReconcileInput) ──> { page, remembered }
 *
 * Key design decisions:
 *     - Types only: no runtime here, so that adapters (React, Next) depend on the contract, not on the engine.
 *     - `UrlAdapter` lives here, not in the React package: the Next adapter implements it, and an adapter may not
 *       import another adapter.
 */

/**
 * The selection state: its facets, sort and page are the URL; `remembered` is not.
 *
 * @example
 * // ?tags=bot&tags=release&sort=date-asc&page=2
 * const state = { facets: { tags: ['bot', 'release'] }, sort: 'date-asc', page: 2 };
 */
export interface SelectionState {
  /** Selected term keys per facet, sorted and unique. */
  readonly facets: Readonly<Record<string, readonly string[]>>;
  /** A name of the sort registry. */
  readonly sort: string;
  /** From 1, within the view's pages. */
  readonly page: number;
  /**
   * The page before the first selection, restored when every value is cleared (by `keepReadingPosition`). Kept out of
   * the URL: a shared link carries no personal navigation detail.
   */
  readonly remembered?: number | undefined;
}

/**
 * What a reader can do to a selection.
 *
 * @example
 * engine.transition(state, { type: 'toggle', facet: 'tags', value: 'bot' });
 * engine.transition(state, { type: 'clear' }); // every facet
 */
export type Action =
  /** Checks a value, or unchecks it when checked; a value the view does not allow is ignored. */
  | { readonly type: 'toggle'; readonly facet: string; readonly value: string }
  /** One facet, or every facet when `facet` is omitted. */
  | { readonly type: 'clear'; readonly facet?: string | undefined }
  /** A name of the sort registry; an unknown one is ignored. */
  | { readonly type: 'sort'; readonly sort: string }
  /** Any number: the engine clamps it to the view's pages. */
  | { readonly type: 'page'; readonly page: number };

/** What a reconciliation strategy sees: before and after the action, as keys only. */
export interface ReconcileInput {
  readonly before: SelectionState;
  /** The new facets and sort; its page is still the previous one, to be decided. */
  readonly after: SelectionState;
  readonly action: Action;
  /** The keys that were visible before the action. */
  readonly previousKeys: readonly string[];
  /** Every key after the action, filtered and sorted. */
  readonly nextOrder: readonly string[];
  readonly perPage: number;
}

/**
 * Chooses the page after a filter, a clear or a sort, and what to remember. Pure. Never asked about a page change,
 * which the engine settles itself: the page asked for, clamped.
 *
 * @param input - The state before and after the action, the keys visible before, every key after, the page size.
 * @returns The page (the engine clamps it) and, optionally, the page to remember while a selection lasts.
 *
 * @example
 * // Always the first page, as `backToFirstPage` does for filters and sorts.
 * const firstPage: Reconcile = () => ({ page: 1 });
 */
export type Reconcile = (input: ReconcileInput) => { readonly page: number; readonly remembered?: number | undefined };

/** One facet of a collection: where an item's values come from, and how a selection combines them. */
export interface FacetDefinition<I> {
  /** The term keys an item carries in this facet. */
  readonly values: (item: I) => readonly string[];
  /** `'any'` (default): at least one selected value; `'all'`: every selected value. */
  readonly mode?: 'any' | 'all' | undefined;
}

/**
 * What a faceted collection declares: data, plus the comparators of its sort registry.
 *
 * @example
 * const definition: FacetedCollection<Post> = {
 *   items: posts,
 *   key: (post) => post.url,
 *   facets: { tags: { values: (post) => post.tags } },
 *   sorts: { 'date-desc': (a, b) => b.date.localeCompare(a.date) },
 *   perPage: 5,
 * };
 */
export interface FacetedCollection<I> {
  /** The items of this view (e.g. one subcategory in one locale), in their natural order. */
  readonly items: readonly I[];
  /** A unique key per item, e.g. its URL: what the view returns. */
  readonly key: (item: I) => string;
  /** N facets, combined with AND; their order is the URL's. */
  readonly facets: Readonly<Record<string, FacetDefinition<I>>>;
  /** The sort registry by URL name; the first is the default, never written in the URL. */
  readonly sorts: Readonly<Record<string, (a: I, b: I) => number>>;
  readonly perPage: number;
  /** The page after a transition; default `keepReadingPosition`. */
  readonly reconcile?: Reconcile | undefined;
  /**
   * Precomputed indexes, facet → value → keys (e.g. generated, keyed by entry URL), restricted to the view's items;
   * built from the items otherwise.
   */
  readonly indexes?: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> | undefined;
}

/**
 * Where the selection state lives: the current search, and how to change it. Implemented with the History API
 * (`@figatellultimate/facets-react`) and for the Next App Router (`@figatellultimate/next16/facets`), or in memory in tests.
 *
 * @example
 * // In memory, as tests do.
 * let search = '';
 * const url: UrlAdapter = { get search() { return search; }, navigate: (next) => { search = next; } };
 */
export interface UrlAdapter {
  /** The current query string, `''` or starting with `?`. */
  readonly search: string;
  /**
   * Writes a new query string, never scrolling. The binding asks `push` for a page change and `replace` for filters
   * and sorts, so that Back leaves the list instead of undoing each filter.
   */
  navigate(
    search: string,
    options: {
      readonly mode: 'replace' | 'push';
      /**
       * The app renders this view itself (its keys and cards at hand, a batch or the index): only the address moves,
       * never a request to the server for it.
       */
      readonly local?: boolean | undefined;
    },
  ): void;
  /**
   * The `href` of a query string, for links (e.g. pagination's); default the query string itself, relative to the
   * page. A listing paginated in its path gives `/…/page/N` for a default page (`pagedHref`).
   */
  href?(search: string): string;
  /**
   * Loads ahead what navigating to a query string would fetch, e.g. a prerendered page's payload through the router
   * (`/…/page/N`), so that its click shows it at once. Nothing to do when navigating fetches nothing (the History API).
   */
  prefetch?(search: string): void;
}

/** What a selection shows. */
export interface View {
  /** The visible slice, sorted: keys only. */
  readonly keys: readonly string[];
  /** Items passing the selection, every page included. */
  readonly total: number;
  /** At least 1. */
  readonly pages: number;
  /** Per facet and value, how many items the view would hold with that value checked too; a checked one: the total. */
  readonly counts: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

/** A faceted collection's engine: pure, frozen, total. */
export interface Engine<I> {
  /**
   * Reads a query string into a valid state.
   *
   * @param search - A query string, or anything printing as one (e.g. `URLSearchParams`).
   * @returns Unknown facets and values dropped, an unknown sort replaced by the default, the page clamped; never throws.
   */
  read(search: string | { toString(): string }): SelectionState;
  /**
   * Writes a state as its canonical query string.
   *
   * @param state - A selection state.
   * @returns `''`, or `?…` with facets in their declared order, values sorted, then the sort and the page when not
   *   the defaults.
   */
  write(state: SelectionState): string;
  /**
   * What a state shows.
   *
   * @param state - A selection state; its page is clamped.
   * @returns The visible keys, the total, the pages and every value's count.
   */
  view(state: SelectionState): View;
  /**
   * Applies an action.
   *
   * @param state - The current state.
   * @param action - What the reader did.
   * @returns The new state (its page chosen by the reconciliation strategy) and its query string; the input is never
   *   mutated.
   */
  transition(state: SelectionState, action: Action): { readonly state: SelectionState; readonly search: string };
  /** The definition's items, for the app's rendering (e.g. keys to cards). */
  readonly items: readonly I[];
  /** The sort registry's names, in order: the default first. */
  readonly sorts: readonly string[];
}
