/**
 * A listing's index: every post of a subcategory, as the items its engine filters and sorts and as their cards' data,
 * one static JSON per listing and locale (`/listing/news/bot`, `/en/listing/news/bot`). A listing's page carries only
 * its slice; the browser fetches this on the first filter or sort (`blog/listing-index.ts`, which checks it). The
 * route itself is `listingIndexRoute` of `@figatellu/next16`.
 */
import { listingIndexRoute } from '@figatellu/next16/listing-index';

import { findBlogFolderByUrl, type BlogFolder } from '#figatellu/blog';
import { mountedUrls } from '#figatellu/urls';

import { cardDataOf, itemsOf, postsOf } from '../../../../blog/posts-data';

export const dynamic = 'force-static';
export const dynamicParams = false;

/** The paged listings: the first page of each folder listing posts, the others share its index. */
const listings = (): readonly BlogFolder[] =>
  mountedUrls.flatMap((item) => {
    const folder = findBlogFolderByUrl(item.url);

    return folder !== undefined && folder.page === 1 && folder.subfolders.length === 0 && folder.perPage !== undefined
      ? [folder]
      : [];
  });

export const { GET, generateStaticParams } = listingIndexRoute({
  listings,
  params: (folder) => ({ locale: folder.locale, folder: Object.values(folder.segments) }),
  build: async (folder) => {
    const posts = await postsOf(folder.entries);

    return { items: itemsOf(posts), cards: await cardDataOf(posts, folder.locale) };
  },
});
