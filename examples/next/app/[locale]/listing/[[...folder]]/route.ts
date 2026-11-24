/**
 * A listing's index: every post of a subcategory, as the items its engine filters and sorts and as their cards' data,
 * one static JSON per listing and locale (`/listing/news/bot`, `/en/listing/news/bot`). A listing's page carries only
 * its slice; the browser fetches this on the first filter or sort (`blog/listing-index.ts`, which checks it). Beside
 * it, every paginated folder's batches: a listing's runs of posts, the blog's or a category's runs of sections
 * (`/listing/pages/1`, `/listing/maquis/pages/1`), hence an optional catch-all. The route itself is
 * `listingIndexRoute` of `@figatellultimate/next16`.
 */
import { batchItems, batchPath } from '@figatellultimate/facets';
import { listingIndexRoute } from '@figatellultimate/next16/listing-index';

import { blogFolderBatches, blogListingIndexes } from '#figatellultimate/blog';

import { cardDataOf, itemsOf, postsOf, sectionDataOf, subfolderKey } from '../../../../blog/posts-data';

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
  // Every paginated folder's batches, ten pages each, in the server's order: `/listing/news/bot/pages/11`.
  pages: {
    listings: blogFolderBatches,
    count: (folder) => folder.pages,
    params: (folder, from) => ({
      locale: folder.locale,
      folder: [...Object.values(folder.segments), ...batchPath(from)],
    }),
    build: async (folder, range) => {
      // A folder of folders: its subfolders' sections.
      if (folder.subfolders.length > 0) {
        const subfolders = batchItems(folder.subfolders, range, folder.perPage);

        return {
          keys: subfolders.map(subfolderKey),
          sections: await sectionDataOf(subfolders, folder.locale, folder.level === null),
        };
      }

      const posts = await postsOf(batchItems(folder.entries, range, folder.perPage));

      return { keys: posts.map((post) => post.url), cards: await cardDataOf(posts, folder.locale) };
    },
  },
});
