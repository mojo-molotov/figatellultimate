// The `keepReadingPosition` transition table, row by row, on the pure engine.
import { describe, expect, it } from 'vitest';

import { backToFirstPage, defineFacetedCollection, type SelectionState } from '../index.js';
import { engine, POSTS, type Post } from './scenario.js';

const url = (i: number): string => `/blog/news/sub/post-${String(i).padStart(2, '0')}`;
const at = (search: string): SelectionState => engine().read(search);

describe('transitions (keepReadingPosition)', () => {
  it('change sort: the page holding the first element of the previous visible slice, in the new order', () => {
    // date-desc page 2 shows posts 6..2; post 6 is the 7th in date-asc, so page 2.
    const before = at('?page=2');

    expect(engine().view(before).keys[0]).toBe(url(6));
    const { state, search } = engine().transition(before, { type: 'sort', sort: 'date-asc' });

    expect(state.page).toBe(2);
    expect(search).toBe('?sort=date-asc&page=2');
    expect(engine().view(state).keys).toContain(url(6));
  });

  it('add a value: same rule, on the new filtered and sorted list, and remember the page before the first selection', () => {
    // date-desc page 3 shows posts 1, 0; with tags=release (posts 10,9,7,6,4,3,1,0), post 1 is the 7th: page 2.
    const before = at('?page=3');

    expect(engine().view(before).keys[0]).toBe(url(1));
    const { state } = engine().transition(before, { type: 'toggle', facet: 'tags', value: 'release' });

    expect(state.facets['tags']).toEqual(['release']);
    expect(state.page).toBe(2);
    expect(state.remembered).toBe(3);
  });

  it('add a value whose list loses the first visible element: page 1', () => {
    // date-desc page 1 starts with post 11 (guide); with tags=bot it is gone.
    const { state } = engine().transition(at(''), { type: 'toggle', facet: 'tags', value: 'bot' });

    expect(state.page).toBe(1);
  });

  it('remove a value while others remain: keep the page if the old and new slices share an element', () => {
    // release+bot page 2 vs release alone page 2: they share elements, so the page is kept.
    const before = { ...at('?tags=release&tags=guide&page=2'), remembered: 1 };
    const { state } = engine().transition(before, { type: 'toggle', facet: 'tags', value: 'guide' });

    expect(state.facets['tags']).toEqual(['release']);
    const previous = engine().view(before).keys;
    const next = engine().view({ ...state }).keys;

    expect(next.some((key) => previous.includes(key))).toBe(true);
    expect(state.page).toBe(2);
    expect(state.remembered).toBe(1);
  });

  it('clear every value: back to the page remembered before the first selection', () => {
    const selected = engine().transition(at('?page=3'), { type: 'toggle', facet: 'tags', value: 'bot' }).state;

    expect(selected.remembered).toBe(3);
    const { state, search } = engine().transition(selected, { type: 'clear' });

    expect(state.page).toBe(3);
    expect(state.remembered).toBeUndefined();
    expect(search).toBe('?page=3');
  });

  it('paginating during a selection forgets the remembered page; clearing then follows the removal rule', () => {
    const selected = engine().transition(at('?page=3'), { type: 'toggle', facet: 'tags', value: 'release' }).state;
    const paged = engine().transition(selected, { type: 'page', page: 1 }).state;

    expect(paged.remembered).toBeUndefined();
    // release page 1 starts with post 10; in the full list (date-desc) post 10 is on page 1.
    const { state } = engine().transition(paged, { type: 'clear' });

    expect(state.page).toBe(1);
  });

  it('clamps a requested page, and writes page 1 as no parameter', () => {
    expect(engine().transition(at(''), { type: 'page', page: 99 }).state.page).toBe(3);
    expect(engine().transition(at('?page=2'), { type: 'page', page: 1 }).search).toBe('');
  });

  it('clears one facet only', () => {
    const before = at('?tags=bot&authors=gustave');
    const { state } = engine().transition(before, { type: 'clear', facet: 'authors' });

    expect(state.facets).toEqual({ tags: ['bot'], authors: [] });
  });

  it('accepts an injected strategy instead of the default one', () => {
    const alwaysFirst = defineFacetedCollection<Post>({
      items: POSTS,
      key: (post) => post.url,
      facets: { tags: { values: (post) => post.tags } },
      sorts: { 'date-desc': (a, b) => (a.date < b.date ? 1 : -1), 'date-asc': (a, b) => (a.date < b.date ? -1 : 1) },
      perPage: 5,
      reconcile: () => ({ page: 1 }),
    });
    const before = alwaysFirst.read('?page=2');

    expect(alwaysFirst.transition(before, { type: 'sort', sort: 'date-asc' }).state.page).toBe(1);
  });

  it('is pure: the input state is never mutated', () => {
    const before = at('?tags=bot');
    const snapshot = JSON.stringify(before);

    engine().transition(before, { type: 'toggle', facet: 'tags', value: 'guide' });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('backToFirstPage', () => {
  const first = engine(backToFirstPage);

  it.each([
    ['a sort', { type: 'sort', sort: 'date-asc' }],
    ['an added value', { type: 'toggle', facet: 'tags', value: 'release' }],
    ['a removed value', { type: 'toggle', facet: 'tags', value: 'guide' }],
    ['a clear', { type: 'clear' }],
  ] as const)('%s goes back to page 1, remembering nothing', (_, action) => {
    const before = first.read('?tags=release&tags=guide&page=2');

    // Precondition: not already on page 1, so that a no-op cannot pass.
    expect(before.page).toBe(2);
    const { state } = first.transition(before, action);

    expect(state.page).toBe(1);
    expect(state.remembered).toBeUndefined();
  });

  it('a page change goes to the page asked for, within bounds', () => {
    expect(first.transition(first.read(''), { type: 'page', page: 2 }).state.page).toBe(2);
    expect(first.transition(first.read(''), { type: 'page', page: 99 }).state.page).toBe(3);
  });

  it('keepReadingPosition stays the default', () => {
    // keepReadingPosition follows the first visible element (page 2 in date-asc), page 1 does not.
    const before = at('?page=2');

    expect(engine().transition(before, { type: 'sort', sort: 'date-asc' }).state.page).toBe(2);
    expect(first.transition(before, { type: 'sort', sort: 'date-asc' }).state.page).toBe(1);
  });
});

describe('a page change, whatever the strategy', () => {
  it('goes to the page asked for, clamped: a strategy only decides filters and sorts', () => {
    // A strategy sending every transition to page 1 once sent a page change there too: the pagination went nowhere.
    const firstPage = engine(() => ({ page: 1 }));
    const before = firstPage.read('');

    expect(firstPage.transition(before, { type: 'page', page: 2 }).state.page).toBe(2);
    expect(firstPage.transition(before, { type: 'page', page: 99 }).search).toBe('?page=3');
    // Its filters still follow it.
    expect(firstPage.transition(firstPage.read('?page=2'), { type: 'sort', sort: 'date-asc' }).state.page).toBe(1);
  });
});
