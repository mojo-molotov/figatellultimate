import { defineFacetedCollection, type Engine, type Reconcile } from '../index.js';

/** A blog subcategory view: 12 posts, two facets, three sorts; more posts than one page, so nothing is trivial. */
export interface Post {
  readonly url: string;
  readonly title: string;
  readonly date: string;
  readonly tags: readonly string[];
  readonly authors: readonly string[];
}

const TAGS = ['bot', 'release', 'guide'] as const;

export const POSTS: readonly Post[] = Array.from({ length: 12 }, (_, i) => ({
  url: `/blog/news/sub/post-${String(i).padStart(2, '0')}`,
  title: `Post ${String.fromCharCode(76 - i)}`, // L, K, … : reverse alphabetical of the dates
  date: `2026-11-${String(i + 1).padStart(2, '0')}`,
  tags: i % 3 === 0 ? ['bot', 'release'] : [TAGS[i % 3] ?? 'guide'],
  authors: i % 2 === 0 ? ['gustave'] : ['arnaud'],
}));

export const PER_PAGE = 5;

export function engine(reconcile?: Reconcile): Engine<Post> {
  return defineFacetedCollection<Post>({
    items: POSTS,
    key: (post) => post.url,
    facets: {
      tags: { values: (post) => post.tags },
      authors: { values: (post) => post.authors, mode: 'all' },
    },
    sorts: {
      'date-desc': (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0),
      'date-asc': (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0),
      'title-asc': (a, b) => a.title.localeCompare(b.title),
    },
    perPage: PER_PAGE,
    ...(reconcile === undefined ? {} : { reconcile }),
  });
}
