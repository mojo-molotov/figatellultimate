/**
 * `@figatellultimate/next16/facets`, a client entry: the App Router's URL adapter of faceted collections.
 *
 * Key design decisions:
 *     - The History API rather than `router.push`: Next's router integrates `pushState` and `replaceState`
 *       (`useSearchParams` follows), so a filter, a sort or a page change sends no request, where the router would
 *       fetch the same static page's payload again for every click.
 *     - A listing paginated in its path (`first`, its own URL): its default pages are prerendered pages
 *       (`/blog/news/page/2`), reached through the router, which fetches the page with its slice; any other view
 *       stays in the query on the listing's URL, through the History API (`pagedHref`, `pagedSearch` of
 *       `@figatellultimate/facets`). A location it never writes (`/blog/news/page/3?tags=bot`, `/blog/news?page=2`) is
 *       replaced, once read, by the view's own: the address shows what the page shows, and a default page gets its
 *       slice from the server.
 *
 * Invariants (`facets.test.ts`): the History API for any view in the query, never the router; with `first`, the
 * router for a default page, its number read from the path, its links in the path; a location it never writes
 * corrected, the others left alone.
 */
'use client';

import { pagedHref, pagedSearch, type UrlAdapter } from '@figatellultimate/facets';
// With its extension: `next` declares no `exports`, and an ES module resolved as `nodenext` needs the real file.
import { usePathname, useRouter, useSearchParams } from 'next/navigation.js';
import { useEffect, useMemo } from 'react';

/** Options of `useNextUrl`. */
export interface NextUrlOptions {
  /** A listing paginated in its path: its own URL, its first page (its default pages at `<first>/page/N`). */
  readonly first?: string | undefined;
}

/**
 * The App Router's URL adapter of faceted collections.
 *
 * @param options - `first`: the listing's own URL when its default pages are prerendered in its path.
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
  const { first } = options;

  const adapter = useMemo((): UrlAdapter => {
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
      search: pagedSearch({ pathname, search: raw }, first),
      navigate(next, { mode }) {
        const href = pagedHref(first, next);

        // A default page: a prerendered page, its slice from the server; any other view: computed here.
        if (!href.includes('?')) router[mode](href, { scroll: false });
        else history(href, mode);
      },
      href: (next) => pagedHref(first, next),
    };
  }, [raw, pathname, first, router]);

  useEffect(() => {
    if (first === undefined) return;

    // A location the listing never writes (typed, or a page in the path mixed with a selection): replaced by the
    // one it reads as, so that the address shows the view.
    if (pagedHref(first, adapter.search) !== `${pathname}${raw}`) adapter.navigate(adapter.search, { mode: 'replace' });
  }, [adapter, first, pathname, raw]);

  return adapter;
}
