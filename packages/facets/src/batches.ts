/**
 * A paginated listing's batches: its default view (no facet, the default sort) cut into runs of pages, each one a
 * small static file beside the listing's index, so that a browser can render a run's pages itself, without asking the
 * server for each. A reader moving through the list loads a batch once, not a page per click.
 *
 *     pages 1 ─ 10 ─┐  11 ─ 20 ─┐  21 ─ …        a batch per run of `size` pages, named by its first page
 *     <index>/pages/1   <index>/pages/11         beside the listing's index (`batchPath`)
 *
 * Key design decisions, as chosen with the user:
 *     - Batches rather than the whole index on idle: a reader pays for the pages around them, whatever the list's
 *       length (the index is ~42 bytes gzip a post, a megabyte at 27,000 posts); the index stays for the filters.
 *     - A batch holds its pages' keys in the default order, and whatever the app needs to show them (its cards).
 *     - Named by its first page, under `pages/`: readable, and computed alike by the route and the browser.
 *
 * Invariants (`batches.test.ts`): every page in exactly one batch, the batches in order, covering the pages; a page's
 * batch starts at most `size - 1` pages before it; the path the same on both sides.
 */

/** Pages a batch holds, by default: ten pages of a listing in one small request. */
export const PAGES_PER_BATCH = 10;

/**
 * The first page of the batch holding a page.
 *
 * @param page - A page, from 1.
 * @param size - Pages per batch.
 * @returns The batch's first page: 1, 1 + size, 1 + 2 × size…
 *
 * @example
 * batchStart(14, 10); // 11
 */
export function batchStart(page: number, size: number = PAGES_PER_BATCH): number {
  return Math.floor((Math.max(1, Math.trunc(page)) - 1) / size) * size + 1;
}

/**
 * Every batch of a listing, as its first page and its last.
 *
 * @param pages - The listing's count of pages (its default view's).
 * @param size - Pages per batch.
 * @returns The batches in order, covering every page once.
 *
 * @example
 * batchesOf(23, 10); // [{ from: 1, to: 10 }, { from: 11, to: 20 }, { from: 21, to: 23 }]
 */
export function batchesOf(
  pages: number,
  size: number = PAGES_PER_BATCH,
): readonly { readonly from: number; readonly to: number }[] {
  const count = Math.max(1, Math.trunc(pages));

  return Array.from({ length: Math.ceil(count / size) }, (_, index) => {
    const from = index * size + 1;

    return Object.freeze({ from, to: Math.min(count, from + size - 1) });
  });
}

/**
 * A batch's path segments under its listing's index, the same for the route and the browser.
 *
 * @param from - The batch's first page.
 * @returns `['pages', '<from>']`: the route's extra params, and the URL's tail (`<index>/pages/11`).
 *
 * @example
 * `${folder.index}/${batchPath(11).join('/')}`; // '/listing/news/bot/pages/11'
 */
export function batchPath(from: number): readonly ['pages', string] {
  return ['pages', String(from)];
}
