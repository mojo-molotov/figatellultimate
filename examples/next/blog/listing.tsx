'use client';

/**
 * A listing's posts, loaded on demand: the facets, the sort and the pagination (`posts.tsx`) are a chunk of their own,
 * kept out of the first load of the blog's and the authors' pages (their routes, `splitRoutes`), which do not all show a
 * listing. Still prerendered: React renders a lazy component on the server too.
 *
 * Key design decision, as chosen with the user: the chunk is also loaded once any page is idle (`ListingPreload`, in
 * the layout), so that a listing reached by a client navigation shows at once; awaited on arrival, its `<main>` stayed
 * empty a moment (~300 ms on the deployed site). Rejected: a plain import, the first load of every page of the blog's
 * route ~9 kB gzip heavier, a post included. Checked by `scripts/browse.ts`: no empty `<main>` from a category to a
 * listing.
 */
import { lazy, Suspense, useEffect, type ComponentProps, type ReactNode } from 'react';

/** The listing's chunk: one import, for the lazy component and the preload alike. */
const posts = () => import('./posts');
const Posts = lazy(async () => ({ default: (await posts()).Posts }));

/**
 * The interactive list of posts, its default view prerendered until the URL is read.
 *
 * @param props - The posts' items, the locale, the cards rendered on the server, and the facets offered.
 * @returns The listing: the default view (real pagination links) in the HTML, the interactive one once hydrated. The
 *   server waits for the chunk, and hydration keeps its HTML until it is here.
 */
export function Listing(props: ComponentProps<typeof Posts>): ReactNode {
  return (
    <Suspense fallback={null}>
      <Posts {...props} />
    </Suspense>
  );
}

/**
 * Loads the listing's chunk once the page is idle (a short delay where `requestIdleCallback` is missing, as in
 * Safari): a listing reached later renders at once.
 *
 * @returns Nothing rendered.
 */
export function ListingPreload(): null {
  useEffect(() => {
    const load = (): void => {
      void posts();
    };

    if (typeof requestIdleCallback === 'function') {
      const handle = requestIdleCallback(load);

      return () => {
        cancelIdleCallback(handle);
      };
    }

    const handle = setTimeout(load, 1000);

    return () => {
      clearTimeout(handle);
    };
  }, []);

  return null;
}
