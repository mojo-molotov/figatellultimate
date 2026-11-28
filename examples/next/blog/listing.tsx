'use client';

/**
 * A listing's posts: renders `Posts` synchronously inside `<main>` so every subcategory and author page prerenders
 * its heading, controls, cards and pagination directly in the initial HTML shell (no `<Suspense fallback={null}>`
 * streaming template that would leave `<main>` empty and shift the footer down on slow mobile connections).
 * `FacetOptions`'s heavy `cmdk` list already code-splits itself on open/hover inside `@figatellultimate/facets-react`.
 */
import type { ComponentProps, ReactNode } from 'react';

import { Posts } from './posts';

/**
 * The interactive list of posts, its default view prerendered directly in `<main>`.
 *
 * @param props - The posts' items, the locale, the cards rendered on the server, and the facets offered.
 * @returns The listing: the default view (real pagination links) in the initial HTML, hydrated in place.
 */
export function Listing(props: ComponentProps<typeof Posts>): ReactNode {
  return <Posts {...props} />;
}
