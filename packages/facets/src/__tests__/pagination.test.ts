import { describe, expect, it } from 'vitest';

import { paginationItems, type PaginationItem } from '../index.js';
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
