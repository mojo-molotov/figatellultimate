/**
 * An author's index: every post they wrote in a locale, as the items its listing's engine filters and sorts and as
 * their cards' data, one static JSON per author and locale (`/author-listing/igor`, `/en/author-listing/igor`). An
 * author's page carries only its slice; the browser fetches this on the first filter or sort, as a subcategory's
 * (`../listing/[...folder]/route.ts`). The route itself is `listingIndexRoute` of `@figatellultimate/next16`.
 */
import { listingIndexRoute } from '@figatellultimate/next16/listing-index';

import { authorsListingIndexes } from '#figatellultimate/terms';

import { cardDataOf, itemsOf, postsOf } from '../../../../blog/posts-data';

export const dynamic = 'force-static';
export const dynamicParams = false;

export const { GET, generateStaticParams } = listingIndexRoute({
  // The paginated authors, from the config (`pages.index`): each one's first page in each locale.
  listings: authorsListingIndexes,
  params: (page) => ({ locale: page.locale, term: page.term }),
  build: async (page) => {
    const posts = await postsOf(page.entries.map((entry) => entry.item));

    return { items: itemsOf(posts), cards: await cardDataOf(posts, page.locale, page.term) };
  },
});
