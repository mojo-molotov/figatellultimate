/** The blog's faceted collection: its items, facets, sorts and page size, shared by the server and the client. */
import { defineFacetedCollection, type Engine } from '@figatellultimate/facets';

/** What the subcategory page knows of a post: its key (URL), what it sorts and filters on. */
export interface PostItem {
  readonly url: string;
  readonly title: string;
  readonly date: string;
  readonly tags: readonly string[];
  readonly authors: readonly string[];
}

/** Posts per page on a listing that is not a folder page (an author's): the folders' own is `perPage`. */
export const PER_PAGE = 2;

/** The sorts' names, in the order the select lists them (the first is the default). */
export const SORTS = ['date-desc', 'date-asc', 'title-asc', 'title-desc'] as const;

/**
 * A listing's collection: two facets, four sorts, the folder's `perPage` (`PER_PAGE` otherwise). Shared by the server
 * (the prerendered default view) and the client (the interactive one); nothing here is blog-specific in figatellultimate.
 */
export function postsEngine(items: readonly PostItem[], locale: string, perPage = PER_PAGE): Engine<PostItem> {
  const byDate = (a: PostItem, b: PostItem): number => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const byTitle = (a: PostItem, b: PostItem): number => a.title.localeCompare(b.title, locale);

  return defineFacetedCollection<PostItem>({
    items,
    key: (post) => post.url,
    facets: { tags: { values: (post) => post.tags }, authors: { values: (post) => post.authors } },
    sorts: {
      'date-desc': (a, b) => byDate(b, a),
      'date-asc': byDate,
      'title-asc': byTitle,
      'title-desc': (a, b) => byTitle(b, a),
    },
    perPage,
    // Facet indexes built from the listing's own items: never the whole blog's, sent to every listing.
  });
}
