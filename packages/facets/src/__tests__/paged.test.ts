import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { isDefaultView, pagedHref, pagedSearch } from '../index.js';
import { engine } from './scenario.js';

/** A location from an href: its path and its query string. */
const locationOf = (href: string): { readonly pathname: string; readonly search: string } => {
  const at = href.indexOf('?');

  return at === -1 ? { pathname: href, search: '' } : { pathname: href.slice(0, at), search: href.slice(at) };
};

const FIRSTS = ['/blog/news', '/blog/news/', '/en/blog', '/'];

/** Any state a reader can reach, written as the engine writes it. */
const search = fc
  .array(
    fc.oneof(
      fc.constantFrom('bot', 'release', 'guide').map((value) => ({ type: 'toggle' as const, facet: 'tags', value })),
      fc.constantFrom('date-desc', 'date-asc', 'title-asc').map((sort) => ({ type: 'sort' as const, sort })),
      fc.integer({ min: 1, max: 4 }).map((page) => ({ type: 'page' as const, page })),
      fc.constant({ type: 'clear' as const }),
    ),
    { maxLength: 6 },
  )
  .map((actions) => {
    const collection = engine();
    let state = collection.read('');

    for (const action of actions) state = collection.transition(state, action).state;

    return collection.write(state);
  });

describe('a listing paginated in its path', () => {
  it('round-trips every state: written as a location, read back as the same query string', () => {
    fc.assert(
      fc.property(search, fc.constantFrom(...FIRSTS), (query, first) => {
        expect(pagedSearch(locationOf(pagedHref(first, query)), first)).toBe(query);
      }),
      {
        examples: [
          ['', '/blog/news'],
          ['?page=2', '/blog/news/'],
          ['?tags=bot&page=2', '/'],
          ['?sort=date-asc', '/en/blog'],
        ],
      },
    );
  });

  it.each([
    ['/blog/news', '', '/blog/news'],
    ['/blog/news', '?page=2', '/blog/news/page/2'],
    ['/blog/news/', '?page=3', '/blog/news/page/3/'],
    ['/', '?page=2', '/page/2'],
    ['/blog/news', '?tags=bot&page=2', '/blog/news?tags=bot&page=2'],
    ['/blog/news', '?sort=date-asc', '/blog/news?sort=date-asc'],
  ])('writes %s with %s as %s: a default page in the path, anything else in the query', (first, query, href) => {
    expect(pagedHref(first, query)).toBe(href);
  });

  it.each([
    ['a default page in the path', '/blog/news/page/2', '', '?page=2'],
    ['the first page', '/blog/news', '', ''],
    ['a selection on the listing', '/blog/news', '?tags=bot&page=2', '?tags=bot&page=2'],
    ['a page in the path mixed with a selection, on its first page', '/blog/news/page/3', '?tags=bot', '?tags=bot'],
    ['a page in the path mixed with a sort and a page', '/blog/news/page/3', '?sort=date-asc&page=2', '?sort=date-asc'],
    ['a page that is not a number', '/blog/news/page/two', '', ''],
    ['another path', '/blog/other/page/2', '?tags=bot', '?tags=bot'],
  ])('reads %s', (_, pathname, query, expected) => {
    expect(pagedSearch({ pathname, search: query }, '/blog/news')).toBe(expected);
  });

  it("writes and reads the project's own names: its page segment in the path, its page parameter in the query", () => {
    const names = { segment: 'seite', param: 'p' };

    expect(pagedHref('/blog/news', '?p=2', names)).toBe('/blog/news/seite/2');
    expect(pagedHref('/blog/news', '?tags=bot&p=2', names)).toBe('/blog/news?tags=bot&p=2');
    expect(pagedSearch({ pathname: '/blog/news/seite/3', search: '' }, '/blog/news', names)).toBe('?p=3');
    // The default names are no longer read: `/page/3` is not a page of this listing.
    expect(pagedSearch({ pathname: '/blog/news/page/3', search: '' }, '/blog/news', names)).toBe('');
    expect(isDefaultView('?p=2', names)).toBe(true);
    expect(isDefaultView('?page=2', names)).toBe(false);
  });

  it('tells a default view, the ones in the path, from any selection or sort', () => {
    fc.assert(
      fc.property(search, fc.constantFrom(...FIRSTS), (query, first) => {
        expect(isDefaultView(query)).toBe(!pagedHref(first, query).includes('?'));
      }),
    );
  });

  it.each([
    ['', true],
    ['?page=3', true],
    // Read from the query alone: a term the page's own items do not hold is still a selection.
    ['?tags=a-term-no-item-has', false],
    ['?sort=title-asc', false],
    ['?page=2&tags=bot', false],
    ['?%E0%A4%A=1', true],
  ])('reads %j as a default view: %s', (query, expected) => {
    expect(isDefaultView(query)).toBe(expected);
  });
});
