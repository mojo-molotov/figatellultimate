/** A Pagefind bundle simulated in memory, per locale: the shape of `pagefind.js` the client relies on. */
export interface FakeDocument {
  readonly url: string;
  readonly title: string;
  readonly text: string;
  readonly collection: string;
}

export interface FakeBundle {
  readonly module: unknown;
  /** Every `search` call, with its filters. */
  readonly searches: { term: string; filters: unknown; sort?: unknown }[];
  readonly preloaded: string[];
  /** Every `options` call. */
  readonly options: unknown[];
  /** How many `data()` calls loaded a result fragment (only displayed results should). */
  readonly fragments: () => number;
}

/** A bundle whose `search` matches documents containing the term, case-insensitively. */
export function fakeBundle(documents: readonly FakeDocument[]): FakeBundle {
  const searches: { term: string; filters: unknown; sort?: unknown }[] = [];
  const preloaded: string[] = [];
  const options: unknown[] = [];
  let fragments = 0;
  const module = {
    init: () => Promise.resolve(),
    options: (value: unknown) => {
      options.push(value);

      return Promise.resolve();
    },
    preload: (term: string) => {
      preloaded.push(term);

      return Promise.resolve();
    },
    search: (term: string, query?: { filters?: { collection?: { any?: readonly string[] } }; sort?: unknown }) => {
      searches.push({ term, filters: query?.filters, ...(query?.sort === undefined ? {} : { sort: query.sort }) });
      const allowed = query?.filters?.collection?.any;
      const found = documents.filter(
        (d) =>
          d.text.toLowerCase().includes(term.toLowerCase()) &&
          (allowed === undefined || allowed.includes(d.collection)),
      );

      return Promise.resolve({
        results: found.map((d, i) => ({
          id: `${d.url}#${String(i)}`,
          data: () => {
            fragments += 1;

            return Promise.resolve({
              url: d.url,
              excerpt: `…<mark>${term}</mark>…`,
              meta: { title: d.title },
              filters: { collection: [d.collection] },
            });
          },
        })),
      });
    },
  };

  return { module, searches, preloaded, options, fragments: () => fragments };
}

export const DOCUMENTS: readonly FakeDocument[] = Array.from({ length: 12 }, (_, i) => ({
  url: `/blog/news/post-${String(i).padStart(2, '0')}`,
  title: `Post ${String(i)}`,
  text: i % 3 === 0 ? 'release notes horses' : 'release notes',
  collection: i < 8 ? 'blog' : 'pages',
}));
