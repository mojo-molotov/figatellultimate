/**
 * A listing's index: every post of a subcategory, as the items its engine filters and sorts and as their cards' data,
 * one static JSON per listing and locale (`/listing/news/bot`, `/en/listing/news/bot`). A listing's page carries only
 * its slice; the browser fetches this on the first filter or sort (`blog/listing-index.ts`, which checks it). The
 * route itself is `listingIndexRoute` of `@figatellultimate/next16`.
 */
import { batchPath } from '@figatellultimate/facets';
import { listingIndexRoute } from '@figatellultimate/next16/listing-index';

import { blogListingIndexes } from '#figatellultimate/blog';

import { cardDataOf, itemsOf, postsOf } from '../../../../blog/posts-data';

export const dynamic = 'force-static';
export const dynamicParams = false;

export const { GET, generateStaticParams } = listingIndexRoute({
  // The paginated subcategories, from the config (`folderPages.index`): their first pages.
  listings: blogListingIndexes,
  params: (folder) => ({ locale: folder.locale, folder: Object.values(folder.segments) }),
  build: async (folder) => {
    const posts = await postsOf(folder.entries);

    return { items: itemsOf(posts), cards: await cardDataOf(posts, folder.locale) };
  },
  // Its batches, ten pages each, in the server's order: `/listing/news/bot/pages/11`.
  pages: {
    count: (folder) => folder.pages,
    params: (folder, from) => ({
      locale: folder.locale,
      folder: [...Object.values(folder.segments), ...batchPath(from)],
    }),
    build: async (folder, { from, to }) => {
      const size = folder.perPage ?? folder.entries.length;
      const posts = await postsOf(folder.entries.slice((from - 1) * size, to * size));

      return { keys: posts.map((post) => post.url), cards: await cardDataOf(posts, folder.locale) };
    },
  },
});
