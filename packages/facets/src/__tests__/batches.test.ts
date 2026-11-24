import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { batchPath, batchStart, batchesOf } from '../index.js';

describe('batches', () => {
  it('puts every page in exactly one batch, in order, the batches covering every page', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2000 }), fc.integer({ min: 1, max: 30 }), (pages, size) => {
        const batches = batchesOf(pages, size);

        expect(batches[0]?.from).toBe(1);
        expect(batches.at(-1)?.to).toBe(pages);

        for (const [index, batch] of batches.entries()) {
          expect(batch.to - batch.from).toBeLessThan(size);
          expect(batches[index + 1]?.from ?? pages + 1).toBe(batch.to + 1);
        }

        for (let page = 1; page <= pages; page++) {
          const holding = batches.filter((batch) => batch.from <= page && page <= batch.to);

          expect(holding.map((batch) => batch.from)).toEqual([batchStart(page, size)]);
        }
      }),
      {
        examples: [
          [1, 10],
          [10, 10],
          [11, 10],
          [23, 10],
        ],
      },
    );
  });

  it('starts a page’s batch at most size − 1 pages before it, on the first page for anything below it', () => {
    expect([1, 10, 11, 14, 20, 21].map((page) => batchStart(page, 10))).toEqual([1, 1, 11, 11, 11, 21]);
    expect(batchStart(0, 10)).toBe(1);
    expect(batchStart(-4, 10)).toBe(1);
  });

  it('names a batch by its first page, under pages/', () => {
    expect(batchPath(11)).toEqual(['pages', '11']);
  });
});
