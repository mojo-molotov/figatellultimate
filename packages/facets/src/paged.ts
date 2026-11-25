/**
 * A listing paginated in its path: its default views (no facet, the default sort) at their own prerendered URLs, the
 * first at the listing's (`/blog/news`), the next ones at `/blog/news/page/2`; any other view in the query string on
 * the listing's URL (`/blog/news?tags=bot&page=2`), computed in the browser. The engine still reads and writes a query
 * string: these two functions map it to and from a location, for a URL adapter (`useNextUrl({ first })`).
 *
 * Key design decisions:
 *     - Only default views move to the path: they are the ones a build can prerender, one page per slice; a
 *       selection or a sort has too many combinations, and stays in the query.
 *     - A location mixing both (`/page/3?tags=bot`) reads as the selection on its first page: a selection already
 *       resets the page, and nothing published links there.
 *     - The listing's own trailing slash, when it has one, is kept on its pages (`/blog/news/page/2/`).
 *     - The names are the project's (`PagedNames`): the page segment of its URLs (`urls.page`, the generated
 *       `pageSegment`) and the page parameter of its engine (`params.page`); `page` for both by default.
 *
 * Invariants (`paged.test.ts`): a round trip for every state (written, then read back); a default page in the path,
 * never in the query; a mixed location on its first page; a default view told from the query alone.
 */
import type { Search } from './codec.js';

/** The names a paginated listing's location uses: the page segment in its path, the page parameter in its query. */
export interface PagedNames {
  /** The segment before a page's number in the path (`urls.page`); default `page`. */
  readonly segment?: string | undefined;
  /** The engine's page parameter (`params.page`); default `page`. */
  readonly param?: string | undefined;
}

const escape = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The query's parameter names, the malformed ones left out, without a DOM or Node type. */
function names(search: string): string[] {
  const query = search.startsWith('?') ? search.slice(1) : search;

  return query.split('&').flatMap((pair) => {
    if (pair === '') return [];

    try {
      return [decodeURIComponent((pair.split('=')[0] ?? '').replaceAll('+', ' '))];
    } catch {
      return [];
    }
  });
}

/** A path without its trailing slash (the root aside), and that slash. */
function split(path: string): { readonly base: string; readonly slash: string } {
  return path.length > 1 && path.endsWith('/') ? { base: path.slice(0, -1), slash: '/' } : { base: path, slash: '' };
}

/**
 * Whether a query string is a default view: no facet, the default sort, a page at most. Read from the query alone,
 * whatever items are loaded, so that a selection is told apart before the whole collection is there.
 *
 * @param search - A query string (`''`, `?page=2`, `?tags=bot`…).
 * @param paged - The engine's page parameter; default `page`.
 * @returns `true` when it holds no parameter but the page's (the views a build prerenders), `false` otherwise.
 *
 * @example
 * isDefaultView('?page=2'); // true
 * isDefaultView('?tags=bot'); // false
 */
export function isDefaultView(search: Search, paged: PagedNames = {}): boolean {
  const param = paged.param ?? 'page';

  return names(search.toString()).every((name) => name === param);
}

/**
 * The location of a listing's view: a default page in the path, anything else in the query.
 *
 * @param first - The listing's own URL, its first page (e.g. `/blog/news`).
 * @param search - The view's canonical query string, as the engine writes it (`''`, `?page=2`, `?tags=bot`…).
 * @param paged - The page segment and parameter; default `page` for both.
 * @returns The listing's URL for its first default page, `<first>/page/N` for another default page, else the
 *   listing's URL with the query string.
 *
 * @example
 * pagedHref('/blog/news', '?page=2'); // '/blog/news/page/2'
 * pagedHref('/blog/news', '?tags=bot&page=2'); // '/blog/news?tags=bot&page=2'
 */
export function pagedHref(first: string, search: Search, paged: PagedNames = {}): string {
  const query = search.toString();
  const params = names(query);
  const segment = paged.segment ?? 'page';

  if (params.length === 0) return first;

  const page = new RegExp(`^\\??${escape(paged.param ?? 'page')}=(\\d{1,9})$`).exec(query)?.[1];

  if (page !== undefined && params.length === 1) {
    const { base, slash } = split(first);

    return Number(page) > 1 ? `${base === '/' ? '' : base}/${segment}/${String(Number(page))}${slash}` : first;
  }

  return `${first}${query.startsWith('?') ? query : `?${query}`}`;
}

/**
 * The query string the engine reads at a location: a default page's number from the path, or the query itself.
 *
 * @param location - The location's path and query string.
 * @param first - The listing's own URL, its first page.
 * @param paged - The page segment and parameter; default `page` for both.
 * @returns `?page=N` for a default page in the path, the query string otherwise; a location mixing a page in the path
 *   with a selection or a sort reads as that selection on its first page.
 *
 * @example
 * pagedSearch({ pathname: '/blog/news/page/2', search: '' }, '/blog/news'); // '?page=2'
 * pagedSearch({ pathname: '/blog/news/page/3', search: '?tags=bot' }, '/blog/news'); // '?tags=bot'
 */
export function pagedSearch(
  location: { readonly pathname: string; readonly search: Search },
  first: string,
  paged: PagedNames = {},
): string {
  const search = location.search.toString();
  const param = paged.param ?? 'page';
  const { base } = split(first);
  const { base: path } = split(location.pathname);
  const prefix = `${base === '/' ? '' : base}/${paged.segment ?? 'page'}/`;
  const page = path.startsWith(prefix) ? /^\d{1,9}$/.exec(path.slice(prefix.length))?.[0] : undefined;

  if (page === undefined) return search;

  const params = names(search).filter((name) => name !== param);

  if (params.length > 0) {
    const query = (search.startsWith('?') ? search.slice(1) : search)
      .split('&')
      .filter((pair) => !new RegExp(`^${escape(param)}(=|$)`).test(pair))
      .join('&');

    return query === '' ? '' : `?${query}`;
  }

  return Number(page) > 1 ? `?${param}=${String(Number(page))}` : '';
}
