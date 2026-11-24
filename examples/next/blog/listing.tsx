'use client';

/**
 * A listing's posts, loaded on demand: the facets, the sort and the pagination (`posts.tsx`) are a chunk of their own,
 * which only listing pages download. Still prerendered: React renders a lazy component on the server too.
 */
import { lazy, Suspense, type ComponentProps, type ReactNode } from 'react';

const Posts = lazy(async () => ({ default: (await import('./posts')).Posts }));

/**
 * The interactive list of posts, its default view prerendered until the URL is read.
 *
 * @param props - The posts' items, the locale, the cards rendered on the server, and the facets offered.
 * @returns The listing: the default view (real pagination links) in the HTML, the interactive one once hydrated. The
 *   server waits for the chunk, and hydration keeps its HTML until it is here: nothing to show meanwhile.
 */
export function Listing(props: ComponentProps<typeof Posts>): ReactNode {
  return (
    <Suspense fallback={null}>
      <Posts {...props} />
    </Suspense>
  );
}
