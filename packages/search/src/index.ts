// prettier-ignore
/**
 * A headless local search client over the Pagefind bundles `figatellultimate search` writes, one per locale.
 *
 * Architecture:
 *     createSearch({ locale, collections }) ──> Search
 *         query(term, { collections, sort })
 *             trim ──> too short? ──> { status: 'too-short' }
 *               └─ quiet time (unless `immediate`) ──> superseded? ──> null
 *                    └─ load <base>/<locale>/pagefind.js ──> missing or broken? ──> { status: 'unavailable' }
 *                         └─ pagefind.search(term, { filters, sort }) ──> fragments
 *                              └─ first batch loaded ──> { status: 'done', results, total, more }
 *
 * Key design decisions:
 *     - One bundle per locale, chosen by the client: Pagefind would otherwise pick its index from the page's
 *       `<html lang>`; with one bundle per locale, the language (and its stemming) never depends on the document.
 *     - Results in batches with `more()`: only displayed results are loaded (each one is a request with Pagefind).
 *     - Never throws: a missing or broken bundle, a failing search or a malformed fragment gives `unavailable` or
 *       drops the result; a missing bundle is retried by the next query (it may have been built since).
 *     - A quiet time before searching, a newer query superseding the pending one (`null`): fewer requests while
 *       typing; skipped when only the options change.
 *     - Sorting is Pagefind's, on keys `figatellultimate search` indexes: applied to every result before any is loaded,
 *       so "see more" stays in order.
 *     - An excerpt never starts with the result's title: a page's body usually opens with its heading, already shown.
 *     - No framework, no DOM or Node types, and Pagefind's package is never imported: the built `pagefind.js` is
 *       loaded at runtime, and checked field by field (an external contract).
 *
 * Invariants (`search.test.ts` with an injected loader; the real bundles in `@figatellultimate/pagefind`'s
 * `browser-bundle.test.ts` and in the example's `verify.ts`):
 *     - Never throws; `unavailable` instead.
 *     - Only the latest query searches; a superseded one resolves to `null`.
 *     - Each sort maps to Pagefind's own on the indexed keys; relevance passes none.
 *     - `result.date` is the indexed date, only when it is text.
 *     - `result.anchor` is the best matching heading's id from Pagefind's `sub_results`, when present.
 */
/**
 * One search result, read from its Pagefind fragment.
 *
 * @example
 * { url: '/blog/news/launch', title: 'Launch', excerpt: 'It is <mark>out</mark>…', collection: 'blog',
 *   meta: { title: 'Launch', breadcrumb: 'Blog › News' }, date: '2026-11-04' }
 */
export interface SearchResult<C extends string> {
  readonly url: string;
  /** The page's title as Pagefind found it (`''` when it has none). */
  readonly title: string;
  /** HTML with `<mark>` around the matched words, as Pagefind gives it. */
  readonly excerpt: string;
  readonly collection: C;
  /** The page's Pagefind metadata (`data-pagefind-meta`), its text values only: e.g. a breadcrumb the app put there. */
  readonly meta: Readonly<Record<string, string>>;
  /** Its publication date as `figatellultimate search` indexed it, `undefined` for an undated page. */
  readonly date?: string | undefined;
  /** The best matching heading's id (from Pagefind's `sub_results`), `undefined` when the match sits above headings. */
  readonly anchor?: string | undefined;
}

/** Whether a query searched: `done`, or why not. */
export type SearchStatus = 'done' | 'too-short' | 'unavailable';

/**
 * The results loaded so far for a query; `more()` loads the next batch, a "see more" that grows the list.
 *
 * @example
 * let page = await search.query('horses');
 * while (page?.more !== undefined) page = await page.more(); // every result
 */
export interface SearchPage<C extends string> {
  /** `too-short`: below the minimum length; `unavailable`: the bundle is missing or broken (a stand-in, not a crash). */
  readonly status: SearchStatus;
  readonly total: number;
  /** Every result loaded so far, in Pagefind's order: each batch is appended. */
  readonly results: readonly SearchResult<C>[];
  readonly more: (() => Promise<SearchPage<C>>) | undefined;
}

/** The sorts a query can ask for, relevance (Pagefind's own order) first: e.g. the options of a sort select. */
export const SEARCH_SORTS = ['relevance', 'title-asc', 'title-desc', 'date-desc', 'date-asc'] as const;
/** How results are ordered: Pagefind's relevance (the default), the title, or the publication date. */
export type SearchSort = (typeof SEARCH_SORTS)[number];

/**
 * Each sort as Pagefind's, on the keys `figatellultimate search` indexes (`@figatellultimate/pagefind`): the title lowercased
 * without accents, and the date twice, so that undated pages come last both newest and oldest first.
 */
const PAGEFIND_SORTS = {
  relevance: undefined,
  'title-asc': { title: 'asc' },
  'title-desc': { title: 'desc' },
  'date-desc': { newest: 'desc' },
  'date-asc': { oldest: 'asc' },
} as const satisfies Record<SearchSort, Readonly<Record<string, 'asc' | 'desc'>> | undefined>;

/** How one query searches. */
export interface QueryOptions<C extends string> {
  /** Only these collections; none or an empty list: every collection. */
  readonly collections?: readonly C[] | undefined;
  /** The results' order, applied to all of them by Pagefind before any is loaded; default `'relevance'`. */
  readonly sort?: SearchSort | undefined;
  /** Search at once, without the quiet time meant for typing: e.g. a new sort, the term unchanged. */
  readonly immediate?: boolean | undefined;
}

/** A search over one locale's bundle. */
export interface Search<C extends string> {
  /** The minimum query length, after trimming (e.g. for a "type at least N characters" message). */
  readonly minLength: number;
  /**
   * Searches a term.
   *
   * @param term - What the reader typed; trimmed.
   * @param options - Collections, sort, and whether to skip the quiet time.
   * @returns The first batch of results; a `too-short` or `unavailable` page; or `null` when a newer query
   *   superseded this one. Never throws.
   */
  query(term: string, options?: QueryOptions<C>): Promise<SearchPage<C> | null>;
  /**
   * Downloads the index fragments a term needs, without searching: e.g. while the reader still types.
   *
   * @param term - What the reader typed; nothing below the minimum length.
   * @param options - The collections the coming query will filter by.
   * @returns When the fragments are loaded. Never throws.
   */
  preload(term: string, options?: QueryOptions<C>): Promise<void>;
}

/** How a search is set up, once per locale. */
export interface SearchOptions<C extends string> {
  /** The locale whose bundle to search: one locale, one language, its stemming. */
  readonly locale: string;
  /** The searchable collections' names: a result from any other collection is dropped. */
  readonly collections: readonly C[];
  /** Where `figatellultimate search --out` was served from; default `/pagefind`. */
  readonly base?: string | undefined;
  /** Results per batch; default 5. */
  readonly batch?: number | undefined;
  /** Minimum query length, after trimming; default 3. */
  readonly minLength?: number | undefined;
  /** Quiet time, in ms, before a query searches; a newer query in between supersedes it. Default 300. */
  readonly debounce?: number | undefined;
  /** Loads `<base>/<locale>/pagefind.js`: replaceable when the bundle lives elsewhere, and in tests. */
  readonly load?: ((url: string) => Promise<unknown>) | undefined;
}

/** The part of Pagefind's browser API the client uses, checked at load time (an external contract). */
interface PagefindModule {
  readonly search: (
    term: string,
    options?: { readonly filters?: unknown; readonly sort?: unknown },
  ) => Promise<unknown>;
  readonly preload?: (term: string, options?: { readonly filters?: unknown }) => Promise<unknown>;
  readonly init?: () => Promise<unknown>;
  readonly options?: (options: { readonly baseUrl: string }) => Promise<unknown>;
}

type Fragment = () => Promise<unknown>;

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

/** Any function: at runtime it takes any arguments and returns something, which is all this type says. */
const isFunction = (value: unknown): value is (...args: readonly unknown[]) => unknown => typeof value === 'function';
const isOptionalFunction = (value: unknown): value is ((...args: readonly unknown[]) => unknown) | undefined =>
  value === undefined || isFunction(value);

function asPagefind(value: unknown): PagefindModule | undefined {
  if (!isObject(value) || typeof value['search'] !== 'function') return undefined;

  const { search, preload, init, options } = value;

  if (!isFunction(search) || !isOptionalFunction(preload) || !isOptionalFunction(init)) return undefined;

  if (!isOptionalFunction(options)) return undefined;

  // The module's own functions, called on it: Pagefind's functions do not rely on `this`, but stay bound anyway.
  return {
    search: (term, query) => Promise.resolve(search.call(value, term, query)),
    ...(preload === undefined ? {} : { preload: (term, query) => Promise.resolve(preload.call(value, term, query)) }),
    ...(init === undefined ? {} : { init: () => Promise.resolve(init.call(value)) }),
    ...(options === undefined ? {} : { options: (settings) => Promise.resolve(options.call(value, settings)) }),
  };
}

/** The fragments of a search response, or `undefined` when it is not one. */
function fragmentsOf(response: unknown): readonly Fragment[] | undefined {
  if (!isObject(response) || !Array.isArray(response['results'])) return undefined;

  const results: readonly unknown[] = response['results'];

  return results.map((result): Fragment => {
    const data = isObject(result) ? result['data'] : undefined;

    return typeof data === 'function' ? () => Promise.resolve(data.call(result)) : () => Promise.resolve(undefined);
  });
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" };

/**
 * The excerpt without the title it starts with: a page's body usually opens with its heading, which Pagefind indexes
 * and quotes (`Title. Text…`), while the title is shown above it. Matched through Pagefind's markup (escaped text and
 * `<mark>`), whitespace runs equal; a `<mark>` cut open is reopened. Unchanged when it does not start with the title.
 */
function withoutTitle(excerpt: string, title: string): string {
  const wanted = title.trim().replaceAll(/\s+/g, ' ');

  if (wanted === '') return excerpt;

  let i = 0;
  let j = 0;
  // An object: TypeScript does not track a `let` written inside the closure below.
  const mark = { open: false };
  /** The next unit of text at `i` (an entity decoded) and its length, after any tags. */
  const next = (): { text: string; length: number } | undefined => {
    while (excerpt[i] === '<') {
      const end = excerpt.indexOf('>', i);

      if (end === -1) return undefined;

      const tag = excerpt.slice(i, end + 1);

      if (tag === '<mark>') mark.open = true;
      else if (tag === '</mark>') mark.open = false;

      i = end + 1;
    }

    if (i >= excerpt.length) return undefined;

    if (excerpt[i] === '&') {
      const end = excerpt.indexOf(';', i);
      const entity = end === -1 ? undefined : ENTITIES[excerpt.slice(i + 1, end)];

      if (entity !== undefined) return { text: entity, length: end + 1 - i };
    }

    return { text: excerpt[i] ?? '', length: 1 };
  };

  while (j < wanted.length) {
    const unit = next();

    if (unit === undefined) return excerpt;

    const space = /\s/.test(unit.text);

    if (space && wanted[j] === ' ') {
      i += unit.length;
      j += 1;

      while (/\s/.test(excerpt[i] ?? '')) i += 1;

      continue;
    }

    if (unit.text !== wanted[j]) return excerpt;

    i += unit.length;
    j += 1;
  }

  // The title must end there: a whole word, followed by its separator or nothing.
  for (let unit = next(); unit !== undefined && /[\s.:;,!?…·|–—-]/.test(unit.text); unit = next()) i += unit.length;

  const rest = excerpt.slice(i);

  if (i < excerpt.length && /[\p{L}\p{N}]/u.test(excerpt[i - 1] ?? '') && rest !== '' && !rest.startsWith('<'))
    return excerpt;

  if (rest === '' || rest === '</mark>') return '';

  return mark.open ? `<mark>${rest}` : rest;
}

/** The total relevance weight of a Pagefind `sub_result`'s `weighted_locations` (1 when absent). */
function subResultWeight(entry: Readonly<Record<string, unknown>>): number {
  const locations = entry['weighted_locations'];

  if (!Array.isArray(locations) || locations.length === 0) return 1;

  let total = 0;

  for (const location of locations) {
    if (isObject(location) && typeof location['weight'] === 'number' && Number.isFinite(location['weight']))
      total += location['weight'];
  }

  return total;
}

/**
 * The highest-weighted matching section's heading id from Pagefind's `sub_results` (which Pagefind returns in
 * document order, not by relevance). Returns `undefined` when the best match sits above headings or under `<h1>`.
 */
function anchorOf(data: Readonly<Record<string, unknown>>): string | undefined {
  const sub = data['sub_results'];

  if (!Array.isArray(sub) || sub.length === 0) return undefined;

  let best: Readonly<Record<string, unknown>> | undefined;
  let bestWeight = -1;

  for (const candidate of sub) {
    if (!isObject(candidate)) continue;

    const weight = subResultWeight(candidate);

    if (weight > bestWeight) {
      best = candidate;
      bestWeight = weight;
    }
  }

  if (best === undefined) return undefined;

  const anchor = best['anchor'];

  if (!isObject(anchor) || typeof anchor['id'] !== 'string' || anchor['id'] === '') return undefined;

  // `<h1>` is the page's own title at the top: landing on the page URL itself needs no fragment.
  if (typeof anchor['element'] === 'string' && anchor['element'].toLowerCase() === 'h1') return undefined;

  return anchor['id'];
}

/**
 * A result from its fragment, `undefined` when the fragment is malformed. The collection is the `collection` filter
 * `figatellultimate search` put on every page, from the same build as the app's collection names.
 */
function resultOf<C extends string>(data: unknown, collections: readonly C[]): SearchResult<C> | undefined {
  if (!isObject(data) || typeof data['url'] !== 'string') return undefined;

  const meta = data['meta'];
  const filters = data['filters'];
  const values: unknown = isObject(filters) ? filters['collection'] : undefined;
  const first: unknown = Array.isArray(values) ? values[0] : undefined;
  const collection = collections.find((name) => name === first);

  if (collection === undefined) return undefined;

  const title = isObject(meta) && typeof meta['title'] === 'string' ? meta['title'] : '';
  const texts = isObject(meta)
    ? Object.fromEntries(
        Object.entries(meta).flatMap(([key, value]) => (typeof value === 'string' ? [[key, value]] : [])),
      )
    : {};
  const anchor = anchorOf(data);

  return {
    url: data['url'],
    title,
    excerpt: typeof data['excerpt'] === 'string' ? withoutTitle(data['excerpt'], title) : '',
    collection,
    meta: Object.freeze(texts),
    ...(texts['date'] === undefined ? {} : { date: texts['date'] }),
    ...(anchor === undefined ? {} : { anchor }),
  };
}

const empty = <C extends string>(status: SearchStatus): SearchPage<C> => ({
  status,
  total: 0,
  results: [],
  more: undefined,
});

/** Waits `ms` with the platform's timer; no DOM or Node types needed (the package runs anywhere). */
function delay(ms: number): Promise<void> {
  // Every supported runtime (browsers, Node, workers, edge) has `setTimeout`; its type lives in DOM or Node typings.
  const found: unknown = Reflect.get(globalThis, 'setTimeout');
  const timer = isFunction(found)
    ? (callback: () => void, wait: number): unknown => found.call(globalThis, callback, wait)
    : undefined;

  return ms <= 0 || timer === undefined
    ? Promise.resolve()
    : new Promise((resolve) => {
        timer(resolve, ms);
      });
}

/** Imports a bundle by URL, untouched by bundlers: it exists only after `figatellultimate search`. */
const importBundle = (url: string): Promise<unknown> =>
  import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ url);

function check(condition: boolean, message: string): void {
  if (!condition) throw new TypeError(`createSearch: ${message}`);
}

/**
 * A headless search over the Pagefind bundle of one locale.
 *
 * @param options - The locale, the searchable collections, and optionally where the bundles are served, the batch
 *   size, the minimum length, the quiet time and the loader.
 * @returns A search: `query`, `preload` and its minimum length.
 * @throws {TypeError} On invalid options (an empty locale, a batch below 1, a negative minimum length or quiet time):
 *   an invalid configuration, never a search's outcome.
 *
 * @example
 * const search = createSearch({ locale: 'fr', collections: ['pages', 'blog'] }); // /pagefind/fr/pagefind.js
 * const page = await search.query('chevaux', { collections: ['blog'], sort: 'date-desc' });
 * if (page?.status === 'done') render(page.results);
 */
export function createSearch<const C extends string>(options: SearchOptions<C>): Search<C> {
  const { locale } = options;
  const base = (options.base ?? '/pagefind').replace(/\/+$/, '');
  const batch = options.batch ?? 5;
  const minLength = options.minLength ?? 3;
  const debounce = options.debounce ?? 300;
  const load = options.load ?? importBundle;

  check(typeof locale === 'string' && locale.trim() !== '', 'locale must be a non-empty string');
  check(Number.isInteger(batch) && batch > 0, 'batch must be a positive integer');
  check(Number.isInteger(minLength) && minLength >= 0, 'minLength must be a non-negative integer');
  check(Number.isFinite(debounce) && debounce >= 0, 'debounce must be a non-negative number');
  const url = `${base}/${locale}/pagefind.js`;

  // Only a loaded bundle is kept: a missing one is retried, it may have been built since (dev).
  let bundle: Promise<PagefindModule | undefined> | undefined;
  const pagefind = (): Promise<PagefindModule | undefined> => {
    bundle ??= load(url)
      .then(async (loaded) => {
        const module = asPagefind(loaded);

        // Indexed URLs are absolute site paths: without this, Pagefind prefixes them with the bundle's
        // parent folder, wrong for any `base` but the default.
        await module?.options?.({ baseUrl: '/' });
        await module?.init?.();

        return module;
      })
      .catch(() => undefined)
      .then((module) => {
        if (module === undefined) bundle = undefined;

        return module;
      });

    return bundle;
  };

  const filtersOf = (query?: QueryOptions<C>): { filters?: unknown } => {
    const collections = query?.collections ?? [];

    return collections.length === 0 ? {} : { filters: { collection: { any: [...collections] } } };
  };
  const searchOptionsOf = (query?: QueryOptions<C>): { filters?: unknown; sort?: unknown } => {
    const sort = PAGEFIND_SORTS[query?.sort ?? 'relevance'];

    return { ...filtersOf(query), ...(sort === undefined ? {} : { sort: { ...sort } }) };
  };

  const pageOf = async (
    fragments: readonly Fragment[],
    loaded: readonly SearchResult<C>[],
    from: number,
  ): Promise<SearchPage<C>> => {
    const data = await Promise.all(
      fragments.slice(from, from + batch).map((fragment) => fragment().catch(() => undefined)),
    );
    const results = [...loaded, ...data.flatMap((item) => resultOf(item, options.collections) ?? [])];
    const next = from + batch;

    return {
      status: 'done',
      total: fragments.length,
      results,
      more: next < fragments.length ? () => pageOf(fragments, results, next) : undefined,
    };
  };

  let generation = 0;

  return {
    minLength,
    async query(term, query) {
      const current = ++generation;
      const trimmed = term.trim();

      if (trimmed.length < minLength) return empty('too-short');

      if (query?.immediate !== true) await delay(debounce);

      if (current !== generation) return null;

      const module = await pagefind();

      if (current !== generation) return null;

      if (module === undefined) return empty('unavailable');

      let fragments: readonly Fragment[] | undefined;

      try {
        fragments = fragmentsOf(await module.search(trimmed, searchOptionsOf(query)));
      } catch {
        fragments = undefined;
      }

      if (current !== generation) return null;

      if (fragments === undefined) return empty('unavailable');

      const page = await pageOf(fragments, [], 0);

      return current === generation ? page : null;
    },

    async preload(term, query) {
      const trimmed = term.trim();

      if (trimmed.length < minLength) return;

      try {
        await (await pagefind())?.preload?.(trimmed, filtersOf(query));
      } catch {
        // A preload is a hint: a broken bundle is reported by the next query.
      }
    },
  };
}
