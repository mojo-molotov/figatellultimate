import { describe, expect, it } from 'vitest';

import { paginationItems, responsivePaginationItems, type PaginationItem } from '../index.js';
import { engine } from './scenario.js';

/** A compact picture of the items: `1 … 4 [5] 6 … 12`. */
const picture = (items: readonly PaginationItem[]): string =>
  items
    .map((item) => (item.type === 'gap' ? '…' : item.current ? `[${String(item.page)}]` : String(item.page)))
    .join(' ');

describe('paginationItems', () => {
  it.each([
    [{ page: 1, pages: 1 }, '[1]'],
    [{ page: 2, pages: 3 }, '1 [2] 3'],
    // As many items whichever page is current: the row keeps its width, nothing shifts when the page changes.
    [{ page: 1, pages: 12 }, '[1] 2 3 4 5 … 12'],
    [{ page: 5, pages: 12 }, '1 … 4 [5] 6 … 12'],
    [{ page: 12, pages: 12 }, '1 … 8 9 10 11 [12]'],
    [{ page: 2, pages: 12, siblings: 1, boundaries: 0 }, '1 [2] 3 4 …'],
    // A gap of a single page shows that page instead.
    [{ page: 4, pages: 12 }, '1 2 3 [4] 5 … 12'],
    [{ page: 5, pages: 12, siblings: 2 }, '1 2 3 4 [5] 6 7 … 12'],
    [{ page: 6, pages: 12, boundaries: 2 }, '1 2 … 5 [6] 7 … 11 12'],
    [{ page: 6, pages: 12, siblings: 0, boundaries: 0 }, '… [6] …'],
  ])('%j → %s', (input, expected) => {
    expect(picture(paginationItems(input))).toBe(expected);
  });

  it('lists the hidden pages of each gap, for the ellipsis menu', () => {
    const gaps = paginationItems({ page: 5, pages: 12 }).filter((item) => item.type === 'gap');

    expect(gaps).toEqual([
      { type: 'gap', pages: [2, 3] },
      { type: 'gap', pages: [7, 8, 9, 10, 11] },
    ]);
  });

  it('is total: every page exactly once, in order, the current one included, gaps of two pages or more, a constant length', () => {
    // Exhaustive over small inputs (no randomness), out-of-range and non-integer values included.
    const pageValues = [-3, 0, 0.5, 1, 2, 3, 5, 7, 8, 13, 99, Number.NaN, Number.POSITIVE_INFINITY];

    for (const pages of [-1, 0, 1, 2, 3, 7, 8, 13, 2.5, Number.NaN]) {
      const total = Number.isFinite(pages) ? Math.max(1, Math.floor(pages)) : 1;

      for (const page of pageValues) {
        for (const siblings of [0, 1, 2, -1, 1.5]) {
          for (const boundaries of [0, 1, 2, -1]) {
            const items = paginationItems({ page, pages, siblings, boundaries });
            const all = items.flatMap((item) => (item.type === 'page' ? [item.page] : item.pages));

            expect(all).toEqual(Array.from({ length: total }, (_, i) => i + 1));
            expect(items.filter((item) => item.type === 'page' && item.current)).toHaveLength(1);

            for (const item of items) if (item.type === 'gap') expect(item.pages.length).toBeGreaterThanOrEqual(2);

            // As many items whichever page is current: both ends, the siblings and the current page, two gaps.
            const slots = 2 * Math.max(0, Math.floor(boundaries)) + 2 * Math.max(0, Math.floor(siblings)) + 3;

            expect(items).toHaveLength(Math.min(total, slots));
          }
        }
      }
    }
  });

  it('clamps the current page into range', () => {
    expect(picture(paginationItems({ page: 40, pages: 3 }))).toBe('1 2 [3]');
    expect(picture(paginationItems({ page: -2, pages: 3 }))).toBe('[1] 2 3');
  });

  it('returns frozen items', () => {
    const items = paginationItems({ page: 5, pages: 12 });

    expect(Object.isFrozen(items)).toBe(true);
    expect(items.every((item) => Object.isFrozen(item))).toBe(true);
  });
});

describe('the engine lists its sorts', () => {
  it('in registry order, the default first', () => {
    expect(engine().sorts).toEqual(['date-desc', 'date-asc', 'title-asc']);
    expect(Object.isFrozen(engine().sorts)).toBe(true);
  });
});

describe('responsivePaginationItems', () => {
  /** The items a layout shows, back in `paginationItems`'s form: the wide one, or the narrow one (no siblings). */
  const view = (input: Parameters<typeof responsivePaginationItems>[0], narrow: boolean): PaginationItem[] => {
    const seen = new Set<string>();

    return responsivePaginationItems(input).flatMap((item): PaginationItem[] => {
      if (item.type === 'page')
        return !narrow || item.narrow ? [{ type: 'page', page: item.page, current: item.current }] : [];

      if (!narrow) return item.wide ? [{ type: 'gap', pages: item.pages }] : [];

      const key = item.narrowPages.join(',');

      if (seen.has(key)) return [];

      seen.add(key);

      return [{ type: 'gap', pages: item.narrowPages }];
    });
  };

  it('shows, on a wide screen, the pagination with its siblings, and on a narrow one, the one without', () => {
    // Exhaustive over small inputs: both layouts are exactly `paginationItems`'s, whatever page is current.
    for (let pages = 1; pages <= 30; pages++)
      for (let page = 1; page <= pages; page++)
        for (const siblings of [1, 2])
          for (const boundaries of [0, 1, 2]) {
            const input = { page, pages, siblings, boundaries };

            expect(view(input, false)).toEqual(paginationItems(input));
            expect(view(input, true)).toEqual(paginationItems({ ...input, siblings: 0 }));
          }
  });

  it.each([
    // Igor's 21 pages, on a phone: the current page's neighbours hidden, the gaps listing them too.
    [{ page: 10, pages: 21 }, '1 …(2-8|2-9) 9w [10] 11w …(12-20|11-20) 21'],
    // Seven pages: no gap on a wide screen, one on a narrow one.
    [{ page: 1, pages: 7 }, '[1] 2 3 4w 5w 6w …n(4-6) 7'],
  ])('%j → %s', (input, expected) => {
    const picture = responsivePaginationItems(input)
      .map((item) => {
        if (item.type === 'page')
          return `${item.current ? `[${String(item.page)}]` : String(item.page)}${item.narrow ? '' : 'w'}`;

        const range = (pages: readonly number[]): string => `${String(pages[0])}-${String(pages.at(-1))}`;

        return item.wide ? `…(${range(item.pages)}|${range(item.narrowPages)})` : `…n(${range(item.narrowPages)})`;
      })
      .join(' ');

    expect(picture).toBe(expected);
  });
});
