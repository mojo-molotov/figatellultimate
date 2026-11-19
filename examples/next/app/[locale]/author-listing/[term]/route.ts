/**
 * An author's index: every post they wrote in a locale, as the items its listing's engine filters and sorts and as
 * their cards' data, one static JSON per author and locale (`/author-listing/igor`, `/en/author-listing/igor`). An
 * author's page carries only its slice; the browser fetches this on the first filter or sort, as a subcategory's
 * (`../listing/[...folder]/route.ts`). The route itself is `listingIndexRoute` of `@figatellultimate/next16`.
 */
import { listingIndexRoute } from '@figatellultimate/next16/listing-index';

import { findAuthorsTermByUrl, type AuthorsTermPage } from '#figatellultimate/terms';
import { mountedUrls } from '#figatellultimate/urls';

import { cardDataOf, itemsOf, postsOf } from '../../../../blog/posts-data';

export const dynamic = 'force-static';
export const dynamicParams = false;

/** The paged authors: each one's first page in each locale, the others share its index. */
const listings = (): readonly AuthorsTermPage[] =>
  mountedUrls.flatMap((item) => {
    const page = item.kind === 'term' ? findAuthorsTermByUrl(item.url) : undefined;

    return page !== undefined && page.page === 1 && page.perPage !== undefined ? [page] : [];
  });

export const { GET, generateStaticParams } = listingIndexRoute({
  listings,
  params: (page) => ({ locale: page.locale, term: page.term }),
  build: async (page) => {
    const posts = await postsOf(page.entries.map((entry) => entry.item));

    return { items: itemsOf(posts), cards: await cardDataOf(posts, page.locale, page.term) };
  },
});
