/**
 * `@figatellultimate/next16/facets`, a client entry: the App Router's URL adapter of faceted collections.
 *
 * Key design decisions:
 *     - The History API rather than `router.push`: Next's router integrates `pushState` and `replaceState`
 *       (`useSearchParams` follows), so a filter, a sort or a page change sends no request, where the router would
 *       fetch the same static page's payload again for every click.
 *     - A listing paginated in its path (`first`, its own URL): its default pages are prerendered pages
 *       (`/blog/news/page/2`), reached through the router, which fetches the page with its slice, and loaded ahead
 *       through it (`prefetch`, the pagination's neighbours and the link under the pointer); any other view
 *       stays in the query on the listing's URL, through the History API (`pagedHref`, `pagedSearch` of
 *       `@figatellultimate/facets`). A location it never writes (`/blog/news/page/3?tags=bot`, `/blog/news?page=2`) is
 *       replaced, once read, by the view's own: the address shows what the page shows, and a default page gets its
 *       slice from the server.
 *
 * Invariants (`facets.test.ts`): the History API for any view in the query, never the router; with `first`, the
 * router for a default page, its number read from the path, its links in the path, a default page loaded ahead
 * through the router and nothing for a view in the query; a location it never writes corrected, the others left
 * alone; a locale switcher's links following the listing's page in the address (`usePagedLocaleLinks`), the server's
 * outside it; the landed page's adapter while the search is unknown, the address's once known (`NextUrlBoundary`).
 */
'use client';

import { pagedHref, pagedSearch, readPage, type PagedNames, type UrlAdapter } from '@figatellultimate/facets';
import { pageLocaleLinks, type ListingLocales, type LocaleLink } from '@figatellultimate/site';
// With its extension: `next` declares no `exports`, and an ES module resolved as `nodenext` needs the real file.
import { usePathname, useRouter, useSearchParams } from 'next/navigation.js';
import { createElement, Suspense, useEffect, useMemo, type ReactNode } from 'react';

/** Options of `useNextUrl`. */
export interface NextUrlOptions extends PagedNames {
  /** A listing paginated in its path: its own URL, its first page (its default pages at `<first>/<segment>/N`). */
  readonly first?: string | undefined;
}

/**
 * The App Router's URL adapter of faceted collections.
 *
 * @param options - `first`: the listing's own URL when its default pages are prerendered in its path; `segment` and
 *   `param`: the project's page segment (the generated `pageSegment`) and its engine's page parameter, `page` by default.
 * @returns An adapter that reads `useSearchParams` and writes with the History API (`pushState` or `replaceState`,
 *   as the binding asks), which Next's router follows: no request to the server, since the engine computes the
 *   view on the client, and no scrolling. With `first`, a default page is read from the path, linked there, and
 *   reached through the router (a prerendered page, its slice from the server). Render the component using it inside
 *   `<Suspense>`: Next 16 requires it for `useSearchParams` in a statically generated page.
 *
 * @example
 * const binding = useFacetedCollection(engine, useNextUrl());
 * const paged = useFacetedCollection(engine, useNextUrl({ first: folder.first }));
 */
export function useNextUrl(options: NextUrlOptions = {}): UrlAdapter {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const raw = params.size === 0 ? '' : `?${params.toString()}`;
  const { first, segment, param } = options;

  const adapter = useMemo((): UrlAdapter => {
    // The project's names: its page segment (the generated `pageSegment`) and its engine's page parameter.
    const names: PagedNames = { segment, param };

    const history = (href: string, mode: 'replace' | 'push'): void => {
      if (mode === 'push') window.history.pushState(null, '', href);
      else window.history.replaceState(null, '', href);
    };

    if (first === undefined)
      return {
        search: raw,
        navigate(next, { mode }) {
          history(`${pathname}${next}`, mode);
        },
      };

    return {
      search: pagedSearch({ pathname, search: raw }, first, names),
      navigate(next, { mode, local }) {
        const href = pagedHref(first, next, names);

        // A default page: a prerendered page, its slice from the server, unless the app renders it itself (`local`:
        // only the address moves, which Next's router follows); any other view: computed here.
        if (!href.includes('?') && local !== true) router[mode](href, { scroll: false });
        else history(href, mode);
      },
      href: (next) => pagedHref(first, next, names),
      // A default page's payload loaded ahead through the router, which keeps it; a view in the query fetches nothing.
      prefetch(next) {
        const href = pagedHref(first, next, names);

        if (!href.includes('?')) router.prefetch(href);
      },
    };
  }, [raw, pathname, first, segment, param, router]);

  useEffect(() => {
    if (first === undefined) return;

    // A location the listing never writes (typed, or a page in the path mixed with a selection): replaced by the
    // one it reads as, so that the address shows the view.
    if (pagedHref(first, adapter.search, { segment, param }) !== `${pathname}${raw}`)
      adapter.navigate(adapter.search, { mode: 'replace' });
  }, [adapter, first, segment, param, pathname, raw]);

  return adapter;
}

/**
 * A locale switcher's links following a paginated listing's page shown in the browser (its batches): the address
 * moved, the server's links did not (`pageLocaleLinks` of `@figatellultimate/site`).
 *
 * @param links - The server's links, for the page the reader landed on (`localeLinksOf`).
 * @param at - The page's locale, and its listing in each locale (`listingLocalesOf`); none for a page that is not one;
 *   the page segment and parameter, as `useNextUrl`'s.
 * @returns The links for the page the address shows: the server's, outside the listing or without one.
 *
 * @example
 * const links = usePagedLocaleLinks(props.links, { locale, listing });
 */
export function usePagedLocaleLinks(
  links: readonly LocaleLink[],
  at: { readonly locale: string; readonly listing?: ListingLocales | undefined } & PagedNames,
): readonly LocaleLink[] {
  const pathname = usePathname();
  const { locale, listing, segment, param } = at;

  return useMemo(() => {
    const first = listing?.[locale]?.first;

    const names = { segment, param };

    if (
      listing === undefined ||
      first === undefined ||
      (pathname !== first && !pathname.startsWith(`${first}/${segment ?? 'page'}/`))
    )
      return links;

    return pageLocaleLinks(links, {
      page: readPage(pagedSearch({ pathname, search: '' }, first, names), param),
      locale,
      listing,
      href: (start, page) => pagedHref(start, page === 1 ? '' : `?${param ?? 'page'}=${String(page)}`, names),
    });
  }, [links, listing, locale, segment, param, pathname]);
}

/** What `NextUrlBoundary` takes. */
export interface NextUrlBoundaryProps extends PagedNames {
  /** A listing paginated in its path: its own URL, its first page (`useNextUrl`'s `first`). */
  readonly first?: string | undefined;
  /** The landed page's number, from 1: what the prerendered HTML shows. Default 1. */
  readonly page?: number | undefined;
  /** Renders the listing from a URL adapter: the landed page's while the search is unknown, then the address's. */
  readonly children: (url: UrlAdapter) => ReactNode;
}

/** The adapter of a prerendered page: its own page, real links, nothing to navigate before hydration. */
function prerenderedUrl(first: string | undefined, page: number, names: PagedNames): UrlAdapter {
  return {
    search: page > 1 ? `?${names.param ?? 'page'}=${String(page)}` : '',
    navigate: () => undefined,
    ...(first === undefined ? {} : { href: (search: string) => pagedHref(first, search, names) }),
  };
}

function LiveUrl({ first, segment, param, children }: NextUrlBoundaryProps): ReactNode {
  return children(useNextUrl({ first, segment, param }));
}

/**
 * A listing's URL in a statically generated page: rendered from the landed page while the search is unknown (the
 * prerendered HTML, where Next suspends `useSearchParams`), then from the address once hydrated.
 *
 * @param props - The listing's first page and the landed page's number, the page segment and parameter (as
 *   `useNextUrl`'s), and what to render from the adapter.
 * @returns The listing inside the `<Suspense>` Next 16 requires around `useSearchParams`, its fallback the landed
 *   page with real links.
 *
 * @example
 * <NextUrlBoundary first={folder.first} page={folder.page}>{(url) => <Listing url={url} />}</NextUrlBoundary>
 */
export function NextUrlBoundary(props: NextUrlBoundaryProps): ReactNode {
  const { first, page = 1, segment, param, children } = props;
  const prerendered = useMemo(() => prerenderedUrl(first, page, { segment, param }), [first, page, segment, param]);

  return createElement(Suspense, { fallback: children(prerendered) }, createElement(LiveUrl, props));
}
