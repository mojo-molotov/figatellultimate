import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  defineFacetedCollection,
  FacetedCollectionError,
  type FacetedCollection,
  type SelectionState,
} from '../index.js';
import { engine, PER_PAGE, POSTS, type Post } from './scenario.js';

const url = (i: number): string => `/blog/news/sub/post-${String(i).padStart(2, '0')}`;
const initial = (): SelectionState => engine().read('');
const [first] = POSTS;

if (first === undefined) throw new Error('the scenario has posts');

/** `name=value` pairs as a search, each part percent-encoded. */
const query = (pairs: readonly (readonly [string, string])[]): string =>
  `?${pairs.map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join('&')}`;

/** The characters that matter to the codec, one per code point. */
const URL_CHARACTERS = [
  '?',
  '&',
  '=',
  '%',
  '+',
  '#',
  't',
  'a',
  'g',
  's',
  'o',
  'r',
  'p',
  'e',
  '0',
  '9',
  '-',
  '_',
  '.',
  '~',
  '/',
  ' ',
  'é',
  '\u{1F600}',
];

/** Any search, weighted toward the characters and parameters that matter to the codec. */
const search = fc.oneof(
  fc.string(),
  fc.string({ unit: fc.constantFrom(...URL_CHARACTERS) }),
  fc.array(fc.tuple(fc.constantFrom('tags', 'authors', 'sort', 'page', 'x'), fc.string())).map(query),
);

/** A search selecting known values, sorts and pages: the states a user can reach. */
const selection = fc
  .record({
    tags: fc.subarray(['bot', 'release', 'guide']),
    authors: fc.subarray(['gustave', 'arnaud']),
    sort: fc.constantFrom('date-desc', 'date-asc', 'title-asc'),
    page: fc.integer({ min: 1, max: 4 }),
  })
  .map(({ tags, authors, sort, page }) =>
    query([
      ...tags.map((tag) => ['tags', tag] as const),
      ...authors.map((author) => ['authors', author] as const),
      ['sort', sort],
      ['page', String(page)],
    ]),
  );

describe('reading the URL', () => {
  it('gives the default state for an empty search', () => {
    expect(initial()).toEqual({ facets: { tags: [], authors: [] }, sort: 'date-desc', page: 1 });
  });

  it('reads repeated parameters, keeps only values present in the view, sorted and unique', () => {
    expect(engine().read('?tags=release&tags=bot&tags=bot&tags=unknown&authors=gustave&sort=date-asc&page=2')).toEqual({
      facets: { tags: ['bot', 'release'], authors: ['gustave'] },
      sort: 'date-asc',
      // Page 2 does not exist: (bot or release) and gustave leaves 4 posts, one page.
      page: 1,
    });
    expect(engine().read('?tags=release&page=2').page).toBe(2);
  });

  it('is total: any search gives a valid state, and its view never throws', () => {
    const valid = (search: string): boolean => {
      const state = engine().read(search);
      const values = Object.values(state.facets).flat();

      return (
        ['date-desc', 'date-asc', 'title-asc'].includes(state.sort) &&
        state.page >= 1 &&
        state.page <= engine().view(state).pages &&
        values.every((value) => ['bot', 'release', 'guide', 'gustave', 'arnaud'].includes(value))
      );
    };

    fc.assert(fc.property(search, valid), {
      examples: [
        ['?tags=bo'],
        ['?colors=red'],
        ['?sort=random'],
        ['?page=99'],
        ['?page=-3'],
        ['?page=two'],
        ['?page=1.5'],
        ['?%E0%A4%A&&&==tags=%ZZ'],
        [`?tags=${'x'.repeat(10_000)}`],
        // A name repeated thousands of times: its values once copied for each, the reading was quadratic.
        [`?${'tags=bot&'.repeat(20_000)}page=2`],
      ],
    });
  });
});

describe('writing the URL', () => {
  it('omits page 1, the default sort and empty facets', () => {
    expect(engine().write(initial())).toBe('');
  });

  it('writes facets in their declared order, values sorted, then sort and page', () => {
    const state: SelectionState = {
      facets: { tags: ['release', 'bot'], authors: ['gustave'] },
      sort: 'date-asc',
      page: 2,
    };

    expect(engine().write(state)).toBe('?tags=bot&tags=release&authors=gustave&sort=date-asc&page=2');
  });

  it('round trips: read(write(state)) equals the state, and writing a read search is canonical', () => {
    fc.assert(
      fc.property(selection, (query) => {
        const state = engine().read(query);
        const written = engine().write(state);

        expect(engine().read(written)).toEqual(state);
        expect(engine().write(engine().read(written))).toBe(written);
      }),
    );
  });

  it('escapes term keys, so any key survives the round trip', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (key) => {
        const keyed = defineWith([{ ...first, tags: [key] }]);
        const state: SelectionState = { facets: { tags: [key], authors: [] }, sort: 'date-desc', page: 1 };

        expect(keyed.read(keyed.write(state))).toEqual(state);
      }),
    );
  });
});

describe('the view', () => {
  it('sorts with the default comparator and paginates, as keys only', () => {
    const view = engine().view(initial());

    expect(view.total).toBe(12);
    expect(view.pages).toBe(3);
    expect(view.keys).toEqual([11, 10, 9, 8, 7].map(url));
  });

  it("'any' keeps an item carrying at least one selected value", () => {
    const view = engine().view(engine().read('?tags=bot&tags=guide&sort=date-asc'));

    expect(view.keys).toEqual([0, 2, 3, 5, 6].map(url));
    expect(view.total).toBe(8);
  });

  it("'all' keeps an item carrying every selected value, and facets combine with AND", () => {
    // authors is an 'all' facet: no post has two authors.
    expect(engine().view(engine().read('?authors=gustave&authors=arnaud')).total).toBe(0);
    // (bot) AND (gustave): posts 0 and 6 only.
    expect(engine().view(engine().read('?tags=bot&authors=gustave&sort=date-asc')).keys).toEqual([0, 6].map(url));
  });

  it('counts, per value, the items the view would hold with that value checked too', () => {
    const counts = engine().view(engine().read('?authors=gustave')).counts;

    // Nothing checked in tags: each tag alone, with the other facets applied.
    expect(counts['tags']).toEqual({ bot: 2, release: 4, guide: 2 });
    // An 'all' facet: a checked value gives the current total, adding arnaud would leave no post.
    expect(counts['authors']).toEqual({ gustave: 6, arnaud: 0 });
  });

  it("an 'any' facet's counts add up: the union with what is checked, the current total for a checked value", () => {
    const state = engine().read('?tags=guide');
    const view = engine().view(state);

    // Precondition: guide alone gives 4 posts, bot alone 4, release alone 8; a per-value count would say so.
    expect(view.total).toBe(4);
    expect(view.counts['tags']).toEqual({ guide: 4, bot: 8, release: 12 });

    // Each count is what checking that value would show.
    for (const value of ['bot', 'release'] as const) {
      const next = engine().transition(state, { type: 'toggle', facet: 'tags', value }).state;

      expect(engine().view(next).total).toBe(view.counts['tags']?.[value]);
    }

    // The other facet's counts apply this one's selection.
    expect(view.counts['authors']).toEqual({ gustave: 2, arnaud: 2 });
  });

  it('clamps the page to the filtered pages', () => {
    const state = engine().read('?tags=bot&page=3');

    expect(state.page).toBe(1);
  });
});

describe('the counts, against their definition', () => {
  /** An item: its tags (an `any` facet) and its colors (an `all` facet), from small pools so that they overlap. */
  const item = fc.record({
    tags: fc.uniqueArray(fc.constantFrom<string>('a', 'b', 'c', 'd'), { maxLength: 3 }),
    colors: fc.uniqueArray(fc.constantFrom<string>('red', 'green', 'blue'), { maxLength: 3 }),
  });

  it('equal, per value, the items passing the other facets and this one with the value checked too', () => {
    fc.assert(
      fc.property(
        fc.array(item, { maxLength: 40 }),
        fc.subarray(['a', 'b', 'c', 'd']),
        fc.subarray(['red', 'green', 'blue']),
        (items, tags, colors) => {
          const keyed = items.map((values, index) => ({ ...values, key: String(index) }));
          const engine = defineFacetedCollection({
            items: keyed,
            key: (post) => post.key,
            facets: { tags: { values: (post) => post.tags }, colors: { values: (post) => post.colors, mode: 'all' } },
            sorts: { given: () => 0 },
            perPage: 5,
          });
          const facets = { tags, colors };
          const passes = (post: (typeof keyed)[number], facet: 'tags' | 'colors', selected: readonly string[]) =>
            selected.length === 0 ||
            (facet === 'colors'
              ? selected.every((value) => post.colors.includes(value))
              : selected.some((value) => post.tags.includes(value)));
          // The definition, one value at a time: the other facet applied, this one with the value added.
          const reference = (facet: 'tags' | 'colors', other: 'tags' | 'colors') =>
            Object.fromEntries(
              [...new Set(keyed.flatMap((post) => post[facet]))].map((value) => {
                const withValue = facets[facet].includes(value) ? facets[facet] : [...facets[facet], value];

                return [
                  value,
                  keyed.filter((post) => passes(post, other, facets[other]) && passes(post, facet, withValue)).length,
                ];
              }),
            );
          const { counts } = engine.view({ facets, sort: 'given', page: 1 });

          expect(counts['tags']).toEqual(reference('tags', 'colors'));
          expect(counts['colors']).toEqual(reference('colors', 'tags'));
        },
      ),
    );
  });
});

describe('facet values are term keys, stable by construction', () => {
  it('a term added to the content does not change the meaning of an existing URL', () => {
    const search = '?tags=release';
    const before = engine().view(engine().read(search)).keys;
    const added: Post = {
      url: '/blog/news/sub/new',
      title: 'New',
      date: '2026-11-01',
      tags: ['aardvark'],
      authors: ['gustave'],
    };
    const withNewTerm = [...POSTS, added];
    const after = defineWith(withNewTerm).view(defineWith(withNewTerm).read(search)).keys;

    expect(after).toEqual(before);
  });
});

function defineWith(items: readonly Post[]) {
  return defineFacetedCollection<Post>({
    items,
    key: (post) => post.url,
    facets: { tags: { values: (post) => post.tags }, authors: { values: (post) => post.authors, mode: 'all' } },
    sorts: { 'date-desc': (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) },
    perPage: PER_PAGE,
  });
}

describe('the URL parameters of the page and the sort', () => {
  const definition = (params?: FacetedCollection<Post>['params']): FacetedCollection<Post> => ({
    items: POSTS,
    key: (post) => post.url,
    facets: { tags: { values: (post) => post.tags } },
    sorts: {
      'date-desc': (a, b) => b.date.localeCompare(a.date),
      'title-asc': (a, b) => a.title.localeCompare(b.title),
    },
    perPage: PER_PAGE,
    ...(params === undefined ? {} : { params }),
  });

  it('are `page` and `sort` by default, the names an app links with', () => {
    expect(defineFacetedCollection(definition()).params).toEqual({ page: 'page', sort: 'sort' });
  });

  it("reads and writes the project's own names, never the defaults", () => {
    const custom = defineFacetedCollection(definition({ page: 'p', sort: 'order' }));
    const state = custom.read('?order=title-asc&p=2');

    expect(state).toMatchObject({ sort: 'title-asc', page: 2 });
    expect(custom.write(state)).toBe('?order=title-asc&p=2');
    // The default names are no longer read.
    expect(custom.read('?sort=title-asc&page=2')).toMatchObject({ sort: 'date-desc', page: 1 });
  });

  it.each<[string, FacetedCollection<Post>['params']]>([
    ["a facet's name", { page: 'tags' }],
    ['one name for both', { page: 'x', sort: 'x' }],
    ['an empty name', { sort: '' }],
    ['a name with a space', { page: 'my page' }],
  ])('throws FacetedCollectionError on %s', (_, params) => {
    expect(() => defineFacetedCollection(definition(params))).toThrow(FacetedCollectionError);
  });
});
