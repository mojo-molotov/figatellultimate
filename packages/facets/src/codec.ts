// prettier-ignore
/**
 * The URL codec of faceted collections: reading a query string into facets, a sort and a page, and writing a state
 * back as its canonical query string.
 *
 * Format:
 *     ?tags=bot&tags=release&authors=gustave&sort=date-asc&page=2
 *      └── one repeated parameter per selected value ──┘ └ sort ┘ └ page ┘
 *     Page 1, the default sort and empty facets are never written.
 *
 * Key design decisions:
 *     - Total: decoding never throws; a malformed component (a lone `%`) is dropped, a forged page clamped. A forged or
 *       truncated link must never crash the view (packed ids would throw on a truncated varint).
 *     - Its own query parser: the package targets ES2022 without DOM or Node types, so `URLSearchParams` is not
 *       assumed; anything printing as a query string is accepted, a `URLSearchParams` included.
 *     - Code-unit order for values: the URL never depends on the reader's locale.
 */
import type { SelectionState } from './types.js';

/** Code-unit order: the URL never depends on the reader's locale. */
const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Anything that prints as a query string: a string, or a `URLSearchParams` (browser, Node, Next). */
export type Search = string | { toString(): string };

/** One query component, decoded; `undefined` when malformed (a lone `%`), never an exception. */
function decode(component: string): string | undefined {
  try {
    return decodeURIComponent(component.replaceAll('+', ' '));
  } catch {
    return undefined;
  }
}

/**
 * A total reading of a query string, without a DOM or Node type (the package runs anywhere): every name maps to its
 * values in order; malformed components are dropped.
 */
function parameters(search: Search): ReadonlyMap<string, readonly string[]> {
  const text = search.toString();
  const query = text.startsWith('?') ? text.slice(1) : text;
  const result = new Map<string, string[]>();

  for (const pair of query.split('&')) {
    if (pair === '') continue;

    const at = pair.indexOf('=');
    const name = decode(at === -1 ? pair : pair.slice(0, at));
    const value = decode(at === -1 ? '' : pair.slice(at + 1));

    if (name === undefined || value === undefined) continue;

    // Added in place: a copy of the values for each repeated name made a long query string quadratic.
    const values = result.get(name);

    if (values === undefined) result.set(name, [value]);
    else values.push(value);
  }

  return result;
}

const encode = (component: string): string => encodeURIComponent(component);

/**
 * The selected values the view allows, per facet.
 *
 * @param search - The query string.
 * @param allowed - Per facet, the values present in the view.
 * @returns Per facet, its selected values sorted and unique; unknown facets and values dropped.
 *
 * @example
 * readFacets('?tags=bot&tags=nope&tags=bot', new Map([['tags', new Set(['bot'])]])); // { tags: ['bot'] }
 */
export function readFacets(
  search: Search,
  allowed: ReadonlyMap<string, ReadonlySet<string>>,
): Record<string, readonly string[]> {
  const params = parameters(search);

  return Object.fromEntries(
    [...allowed].map(([facet, values]) => [
      facet,
      [...new Set((params.get(facet) ?? []).filter((value) => values.has(value)))].sort(compareText),
    ]),
  );
}

/**
 * The sort named in the search.
 *
 * @param search - The query string.
 * @param sorts - The registry's names, the default first.
 * @param name - The sort's URL parameter; default `sort`.
 * @returns The named sort when the registry has it, the default otherwise.
 *
 * @example
 * readSort('?sort=title-asc', ['date-desc', 'title-asc']); // 'title-asc'
 */
export function readSort(search: Search, sorts: readonly string[], name = 'sort'): string {
  const sort = parameters(search).get(name)?.[0];

  return sort !== undefined && sorts.includes(sort) ? sort : (sorts[0] ?? '');
}

/**
 * The page in the search.
 *
 * @param search - The query string.
 * @param name - The page's URL parameter; default `page`.
 * @returns A positive whole number of at most nine digits, 1 otherwise; the caller clamps it to the view's pages.
 *
 * @example
 * readPage('?page=-3'); // 1
 */
export function readPage(search: Search, name = 'page'): number {
  const raw = parameters(search).get(name)?.[0];

  if (raw === undefined || !/^\d{1,9}$/.test(raw)) return 1;

  return Math.max(1, Number(raw));
}

/**
 * The canonical query string of a state.
 *
 * @param state - The state.
 * @param facets - The facets' names, in their declared order.
 * @param defaultSort - The sort never written.
 * @param params - The URL parameters of the page and the sort; default `page` and `sort`.
 * @returns `''`, or `?…`: facets in their declared order, values sorted, then the sort and the page when not the
 *   defaults.
 *
 * @example
 * writeState({ facets: { tags: ['release', 'bot'] }, sort: 'date-desc', page: 1 }, ['tags'], 'date-desc');
 * // '?tags=bot&tags=release'
 */
export function writeState(
  state: SelectionState,
  facets: readonly string[],
  defaultSort: string,
  params: { readonly page: string; readonly sort: string } = { page: 'page', sort: 'sort' },
): string {
  const pairs: string[] = [];

  for (const facet of facets) {
    for (const value of [...(state.facets[facet] ?? [])].sort(compareText))
      pairs.push(`${encode(facet)}=${encode(value)}`);
  }

  if (state.sort !== defaultSort) pairs.push(`${encode(params.sort)}=${encode(state.sort)}`);

  if (state.page > 1) pairs.push(`${encode(params.page)}=${String(state.page)}`);

  return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
}
