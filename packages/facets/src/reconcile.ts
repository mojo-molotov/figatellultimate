/**
 * Page reconciliation: which page a listing shows after a filter, a sort or a page change. Two strategies, pure
 * functions of the states before and after: `keepReadingPosition` (the default) and `backToFirstPage`.
 *
 * Decision table of `keepReadingPosition` (replayed by `transitions.test.ts`):
 *     action              selection after   page
 *     ─────────────────   ───────────────   ─────────────────────────────────────────────────────
 *     page                any               the page asked for (clamped); forgets the remembered page
 *     sort                some              follows the first visible element
 *     add a value         some              follows the first visible element; remembers the page
 *                                           before the first selection
 *     remove / clear      some              keeps the page if the slices overlap, else follows
 *     remove / clear      none              the remembered page, else keeps or follows
 *
 * Key design decisions:
 *     - A strategy is injected (`FacetedCollection.reconcile`), never hard-coded: apps pick the behavior by name.
 *     - Strategies see keys only, never elements: no refs, direction enum or effects;
 *       here it is a function tested on a table.
 */
import type { Reconcile, ReconcileInput } from './types.js';

const hasSelection = (facets: Readonly<Record<string, readonly string[]>>): boolean =>
  Object.values(facets).some((values) => values.length > 0);

const pageOf = (index: number, perPage: number): number => Math.floor(index / perPage) + 1;
const pagesOf = (count: number, perPage: number): number => Math.max(1, Math.ceil(count / perPage));
const sliceOf = (order: readonly string[], page: number, perPage: number): readonly string[] =>
  order.slice((page - 1) * perPage, page * perPage);

/** The page holding the first previously visible element in the new order, page 1 otherwise. */
function follow({ previousKeys, nextOrder, perPage }: ReconcileInput): number {
  const first = previousKeys[0];
  const index = first === undefined ? -1 : nextOrder.indexOf(first);

  return index === -1 ? 1 : pageOf(index, perPage);
}

/** Keep the page when the old and new slices share an element, follow the first element otherwise. */
function keepOrFollow(input: ReconcileInput): number {
  const { before, previousKeys, nextOrder, perPage } = input;
  const page = Math.min(before.page, pagesOf(nextOrder.length, perPage));
  const shared = sliceOf(nextOrder, page, perPage).some((key) => previousKeys.includes(key));

  return shared ? page : follow(input);
}

/**
 * Keeps the reader's place: the default reconciliation.
 *
 * - A sort change or an added value follows the first element that was visible: the page now holding it, page 1 when
 *   it is gone.
 * - A removed value keeps the page when the old and new slices share an element, follows the first one otherwise.
 * - Clearing every value restores the page remembered before the first selection.
 * - Paginating during a selection forgets that page.
 *
 * @param input - The states before and after, the keys visible before, every key after, the page size.
 * @returns The page, and the page to remember while a selection lasts.
 *
 * @example
 * // On page 3 with no selection, a value is checked: its page follows the first visible post, and page 3 is
 * // remembered; clearing every value later comes back to page 3.
 * defineFacetedCollection({ ...definition }); // keepReadingPosition is the default
 */
export const keepReadingPosition: Reconcile = (input) => {
  const { before, after, action, nextOrder, perPage } = input;
  const pages = pagesOf(nextOrder.length, perPage);
  const selectedBefore = hasSelection(before.facets);
  const selectedAfter = hasSelection(after.facets);

  if (action.type === 'page') {
    const page = Math.min(Math.max(1, Math.trunc(action.page)), pages);

    return { page, remembered: selectedAfter ? undefined : before.remembered };
  }

  if (!selectedAfter) {
    const restored = before.remembered;

    return { page: restored === undefined ? keepOrFollow(input) : Math.min(restored, pages) };
  }

  // The page before the first selection, kept while a selection lasts.
  const remembered = selectedBefore ? before.remembered : before.page;

  if (action.type === 'sort') return { page: follow(input), remembered };

  const removed =
    action.type === 'clear' || (before.facets[action.facet] ?? []).length > (after.facets[action.facet] ?? []).length;

  return { page: removed ? keepOrFollow(input) : follow(input), remembered };
};

/**
 * Back to page 1: a filter, a clear or a sort shows the first page; a page change goes to the page asked for, within
 * bounds; nothing is remembered. The alternative to `keepReadingPosition`.
 *
 * @param input - The action, every key after it, the page size.
 * @returns The page.
 *
 * @example
 * defineFacetedCollection({ ...definition, reconcile: backToFirstPage });
 */
export const backToFirstPage: Reconcile = ({ action, nextOrder, perPage }) => ({
  page: action.type === 'page' ? Math.min(Math.max(1, Math.trunc(action.page)), pagesOf(nextOrder.length, perPage)) : 1,
});
