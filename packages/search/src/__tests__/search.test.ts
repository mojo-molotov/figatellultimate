import { describe, expect, it } from 'vitest';

import { createSearch, type SearchPage } from '../index.js';
import { DOCUMENTS, fakeBundle } from './fake-pagefind.js';

const COLLECTIONS = ['blog', 'pages'] as const;

function setup(options: { debounce?: number; batch?: number } = {}) {
  const bundle = fakeBundle(DOCUMENTS);
  const loads: string[] = [];
  const search = createSearch({
    collections: COLLECTIONS,
    locale: 'fr',
    debounce: options.debounce ?? 0,
    ...(options.batch === undefined ? {} : { batch: options.batch }),
    load: (url) => {
      loads.push(url);

      return Promise.resolve(bundle.module);
    },
  });

  return { bundle, loads, search };
}

const done = (page: SearchPage<(typeof COLLECTIONS)[number]> | null): SearchPage<(typeof COLLECTIONS)[number]> => {
  if (page === null) throw new Error('expected a page, the query was superseded');

  return page;
};

describe('createSearch', () => {
  it("loads its locale's bundle once, from <base>/<locale>/pagefind.js", async () => {
    const { loads, search } = setup();

    await search.query('release');
    await search.query('notes');
    expect(loads).toEqual(['/pagefind/fr/pagefind.js']);
  });

  it('keeps result URLs as indexed: Pagefind gets baseUrl "/", whatever the base', async () => {
    const { bundle, search } = setup();

    await search.query('release');
    expect(bundle.options).toEqual([{ baseUrl: '/' }]);
  });

  it('honours a custom base, without a double slash', async () => {
    const loads: string[] = [];
    const search = createSearch({
      collections: COLLECTIONS,
      locale: 'en',
      base: '/assets/search/',
      debounce: 0,
      load: (url) => {
        loads.push(url);

        return Promise.resolve(fakeBundle([]).module);
      },
    });

    await search.query('anything');
    expect(loads).toEqual(['/assets/search/en/pagefind.js']);
  });

  it('gives the first batch, then the next ones with more(), loading only those results', async () => {
    const { bundle, search } = setup({ batch: 5 });
    const first = done(await search.query('release'));

    expect(first.status).toBe('done');
    expect(first.total).toBe(12);
    expect(first.results.map((r) => r.url)).toEqual(DOCUMENTS.slice(0, 5).map((d) => d.url));
    expect(bundle.fragments()).toBe(5);
    expect(first.results[0]).toEqual({
      url: DOCUMENTS[0]?.url,
      title: 'Post 0',
      excerpt: '…<mark>release</mark>…',
      collection: 'blog',
      meta: { title: 'Post 0' },
    });

    const second = await first.more?.();

    // Each page carries every result loaded so far: a "see more" list grows.
    expect(second?.results.map((r) => r.url)).toEqual(DOCUMENTS.slice(0, 10).map((d) => d.url));
    const third = await second?.more?.();

    expect(third?.results).toHaveLength(12);
    expect(third?.more).toBeUndefined();
    expect(bundle.fragments()).toBe(12);
  });

  it('filters by collections, as an "any" Pagefind filter', async () => {
    const { bundle, search } = setup();
    const page = done(await search.query('release', { collections: ['pages'] }));

    expect(page.total).toBe(4);
    expect(page.results.every((r) => r.collection === 'pages')).toBe(true);
    expect(bundle.searches.at(-1)?.filters).toEqual({ collection: { any: ['pages'] } });
    // No collection given (or an empty list): no filter at all.
    await search.query('release', { collections: [] });
    expect(bundle.searches.at(-1)?.filters).toBeUndefined();
  });

  it.each([
    ['title-asc', { title: 'asc' }],
    ['title-desc', { title: 'desc' }],
    ['date-desc', { newest: 'desc' }],
    ['date-asc', { oldest: 'asc' }],
  ] as const)('sorts with Pagefind itself, on the indexed keys: %s', async (sort, expected) => {
    const { bundle, search } = setup();

    await search.query('release', { sort, collections: ['blog'] });
    expect(bundle.searches.at(-1)).toEqual({
      term: 'release',
      filters: { collection: { any: ['blog'] } },
      sort: expected,
    });
  });

  it('relevance, the default, passes no sort', async () => {
    const { bundle, search } = setup();

    await search.query('release', { sort: 'relevance' });
    await search.query('release');
    expect(bundle.searches.map((s) => s.sort)).toEqual([undefined, undefined]);
  });

  it('answers too-short below the minimum length (default: 3 characters), without loading anything', async () => {
    const { loads, search } = setup();

    expect(await search.query('  re ')).toEqual({ status: 'too-short', total: 0, results: [], more: undefined });
    expect(loads).toEqual([]);
  });

  it('trims the term before searching', async () => {
    const { bundle, search } = setup();

    await search.query('  horses  ');
    expect(bundle.searches.at(-1)?.term).toBe('horses');
  });

  it('resolves superseded queries to null: only the last one searches (debouncing)', async () => {
    const { bundle, search } = setup({ debounce: 20 });
    const [a, b, c] = await Promise.all([search.query('rel'), search.query('rele'), search.query('release')]);

    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(done(c).total).toBe(12);
    expect(bundle.searches.map((s) => s.term)).toEqual(['release']);
  });

  it('an immediate query skips the quiet time: a new sort, the term unchanged', async () => {
    // A quiet time no test would wait for: only an immediate query can answer.
    const { bundle, search } = setup({ debounce: 60_000 });

    expect(done(await search.query('release', { immediate: true })).total).toBe(12);
    expect(bundle.searches).toHaveLength(1);
  });

  it('a query superseded while searching resolves to null too', async () => {
    const { search } = setup();
    const first = search.query('release');
    const second = search.query('horses');

    expect(await first).toBeNull();
    expect(done(await second).total).toBe(4);
  });

  it.each([
    ['a missing bundle', () => Promise.reject(new Error('404'))],
    ['a module that is not Pagefind', () => Promise.resolve({ default: 42 })],
    ['a bundle whose search throws', () => Promise.resolve({ search: () => Promise.reject(new Error('broken')) })],
    ['a bundle returning garbage', () => Promise.resolve({ search: () => Promise.resolve('nope') })],
  ])('never throws on %s: status unavailable', async (_, load) => {
    const search = createSearch({ collections: COLLECTIONS, locale: 'fr', debounce: 0, load });

    expect(await search.query('release')).toEqual({ status: 'unavailable', total: 0, results: [], more: undefined });
    await expect(search.preload('release')).resolves.toBeUndefined();
  });

  it('retries a missing bundle on the next query (it may have been built since)', async () => {
    let attempts = 0;
    const bundle = fakeBundle(DOCUMENTS);
    const search = createSearch({
      collections: COLLECTIONS,
      locale: 'fr',
      debounce: 0,
      load: () => (++attempts === 1 ? Promise.reject(new Error('404')) : Promise.resolve(bundle.module)),
    });

    expect(done(await search.query('release')).status).toBe('unavailable');
    expect(done(await search.query('release')).total).toBe(12);
  });

  it('drops results whose fragment is malformed instead of inventing fields', async () => {
    const module = {
      search: () =>
        Promise.resolve({
          results: [
            { data: () => Promise.resolve({ url: '/ok', excerpt: 'x', meta: {}, filters: { collection: ['blog'] } }) },
            { data: () => Promise.resolve({ excerpt: 'no url' }) },
            { data: () => Promise.reject(new Error('fragment')) },
          ],
        }),
    };
    const search = createSearch({
      collections: COLLECTIONS,
      locale: 'fr',
      debounce: 0,
      load: () => Promise.resolve(module),
    });
    const page = done(await search.query('anything'));

    expect(page.results).toEqual([{ url: '/ok', title: '', excerpt: 'x', collection: 'blog', meta: {} }]);
  });

  it.each([
    ['the plain title and its separator', 'Le bot démarre. Le bot démarre.', 'Le bot démarre.'],
    [
      'a title with matches inside',
      'Le <mark>bot</mark> démarre. Le <mark>bot</mark> démarre.',
      'Le <mark>bot</mark> démarre.',
    ],
    ['a match spanning the end of the title', 'Le bot <mark>démarre. Vite</mark>', '<mark>Vite</mark>'],
    ['escaped characters', 'Q&amp;A &lt;bot&gt;. Ça marche', 'Ça marche'],
    ['only the title', 'Le bot démarre.', ''],
  ])('drops the title the excerpt starts with (the body repeats its heading): %s', async (_, excerpt, expected) => {
    const title = excerpt.startsWith('Q&amp;') ? 'Q&A <bot>' : 'Le bot démarre';
    const module = {
      search: () =>
        Promise.resolve({
          results: [
            {
              data: () => Promise.resolve({ url: '/a', excerpt, meta: { title }, filters: { collection: ['blog'] } }),
            },
          ],
        }),
    };
    const search = createSearch({
      collections: COLLECTIONS,
      locale: 'fr',
      debounce: 0,
      load: () => Promise.resolve(module),
    });

    expect(excerpt).not.toBe(expected);
    expect(done(await search.query('anything')).results[0]?.excerpt).toBe(expected);
  });

  it.each([
    ['a title elsewhere in the excerpt', '…puis Le bot démarre. Ensuite'],
    ['a longer first word', 'Le bots démarrent. Ensuite'],
  ])('keeps an excerpt that does not start with the title: %s', async (_, excerpt) => {
    const module = {
      search: () =>
        Promise.resolve({
          results: [
            {
              data: () =>
                Promise.resolve({
                  url: '/a',
                  excerpt,
                  meta: { title: 'Le bot démarre' },
                  filters: { collection: ['blog'] },
                }),
            },
          ],
        }),
    };
    const search = createSearch({
      collections: COLLECTIONS,
      locale: 'fr',
      debounce: 0,
      load: () => Promise.resolve(module),
    });

    expect(done(await search.query('anything')).results[0]?.excerpt).toBe(excerpt);
  });

  it("exposes the page's metadata (its text values only), e.g. a breadcrumb the app put there", async () => {
    const module = {
      search: () =>
        Promise.resolve({
          results: [
            {
              data: () =>
                Promise.resolve({
                  url: '/blog/a',
                  excerpt: '',
                  meta: { title: 'Un article', breadcrumb: 'Blog › Tutoriels', image: 42 },
                  filters: { collection: ['blog'] },
                }),
            },
          ],
        }),
    };
    const search = createSearch({
      collections: COLLECTIONS,
      locale: 'fr',
      debounce: 0,
      load: () => Promise.resolve(module),
    });

    expect(done(await search.query('anything')).results[0]?.meta).toEqual({
      title: 'Un article',
      breadcrumb: 'Blog › Tutoriels',
    });
  });

  it("exposes a result's date from its metadata, only when it is text", async () => {
    const result = (url: string, meta: Record<string, unknown>) => ({
      data: () => Promise.resolve({ url, excerpt: '', meta, filters: { collection: ['blog'] } }),
    });
    const module = {
      search: () =>
        Promise.resolve({
          results: [
            result('/a', { title: 'A', date: '2026-11-04' }),
            result('/b', { title: 'B' }),
            result('/c', { date: 3 }),
          ],
        }),
    };
    const search = createSearch({
      collections: COLLECTIONS,
      locale: 'fr',
      debounce: 0,
      load: () => Promise.resolve(module),
    });

    expect(done(await search.query('anything')).results.map((r) => r.date)).toEqual([
      '2026-11-04',
      undefined,
      undefined,
    ]);
  });

  it('drops a result from a collection it was not given', async () => {
    const result = (collection: string) => ({
      data: () =>
        Promise.resolve({ url: `/${collection}`, excerpt: '', meta: {}, filters: { collection: [collection] } }),
    });
    const module = { search: () => Promise.resolve({ results: [result('docs'), result('blog')] }) };
    const search = createSearch({
      collections: COLLECTIONS,
      locale: 'fr',
      debounce: 0,
      load: () => Promise.resolve(module),
    });

    expect(done(await search.query('anything')).results.map((item) => item.url)).toEqual(['/blog']);
  });

  it('exposes its minimum length', () => {
    expect(setup().search.minLength).toBe(3);
    expect(createSearch({ collections: COLLECTIONS, locale: 'fr', minLength: 2 }).minLength).toBe(2);
  });

  it('preloads from the minimum length only', async () => {
    const { bundle, search } = setup();

    await search.preload('re');
    await search.preload('rel');
    expect(bundle.preloaded).toEqual(['rel']);
  });

  it('rejects invalid options at construction (invalid config)', () => {
    expect(() => createSearch({ collections: COLLECTIONS, locale: '' })).toThrow(TypeError);
    expect(() => createSearch({ collections: COLLECTIONS, locale: 'fr', batch: 0 })).toThrow(TypeError);
    expect(() => createSearch({ collections: COLLECTIONS, locale: 'fr', minLength: -1 })).toThrow(TypeError);
    expect(() => createSearch({ collections: COLLECTIONS, locale: 'fr', debounce: Number.NaN })).toThrow(TypeError);
  });
});
