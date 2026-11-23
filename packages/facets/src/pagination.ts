/**
 * The pagination model: which page links and gaps a pagination shows, as data. Pure, so that the component only
 * renders it, and so that it is tested exhaustively over small inputs (`pagination.test.ts`).
 *
 * Key design decision: a constant length. Both ends, the current page and its siblings, and two gaps always take the
 * same number of items, whichever page is current: near an end, the siblings' window slides inward and shows more
 * pages (`[1] 2 3 4 5 … 12`) rather than fewer, so the row keeps its width and nothing beside it shifts when the page
 * changes. A pagination that grew and shrank with the current page made every click jump.
 *
 * Invariants (`pagination.test.ts`): every page exactly once, in order, the current one included; gaps of two pages
 * or more; as many items whichever page is current; any input gives a valid list. Its responsive form gives each
 * layout exactly its own items, the narrow one without siblings, so that a phone's pagination fits one line.
 */
/** One item of a pagination: a page link, or a gap of hidden pages (an ellipsis, e.g. opening a menu of them). */
export type PaginationItem =
  | { readonly type: 'page'; readonly page: number; readonly current: boolean }
  | { readonly type: 'gap'; readonly pages: readonly number[] };

/** Where a pagination is, and how much of it to show. */
export interface PaginationInput {
  readonly page: number;
  readonly pages: number;
  /** Pages shown on each side of the current one; default 1. */
  readonly siblings?: number | undefined;
  /** Pages shown at each end; default 1. */
  readonly boundaries?: number | undefined;
}

/** A whole number at least `min`, from any input (`NaN`, fractions, infinities, negatives). */
const whole = (value: number | undefined, fallback: number, min: number): number =>
  value === undefined || Number.isNaN(value) ? fallback : Math.max(min, Math.floor(value));

/**
 * The items of a pagination: the first and last `boundaries` pages, `siblings` pages around the current one, and gaps
 * in between, always as many items (`2 × boundaries + 2 × siblings + 3`, or every page when there are fewer): near
 * an end, the window around the current page slides inward. A gap of a single page shows that page instead.
 *
 * @param input - The current page, the number of pages, and optionally the siblings and boundaries (1 each).
 * @returns Every page exactly once, in order, the current one included, as many items whichever page is current;
 *   any input, even `NaN` or infinite, gives a valid list.
 *
 * @example
 * paginationItems({ page: 5, pages: 10 });
 * // 1, gap [2, 3], 4, 5 (current), 6, gap [7, 8, 9], 10
 */
export function paginationItems(input: PaginationInput): readonly PaginationItem[] {
  const pages = Number.isFinite(input.pages) ? whole(input.pages, 1, 1) : 1;
  const page = Math.min(pages, whole(input.page, 1, 1));
  const siblings = Number.isFinite(input.siblings ?? 1) ? whole(input.siblings, 1, 0) : pages;
  const boundaries = Number.isFinite(input.boundaries ?? 1) ? whole(input.boundaries, 1, 0) : pages;
  // The siblings' window, slid inward near an end so that the length stays the same: it starts after the first
  // boundaries and a gap's slot, and ends before the last ones.
  const from = Math.max(Math.min(page - siblings, pages - boundaries - 2 * siblings - 1), boundaries + 2);
  const to = Math.min(Math.max(page + siblings, boundaries + 2 * siblings + 2), pages - boundaries - 1);
  const shown = (n: number): boolean =>
    n === page || n <= boundaries || n > pages - boundaries || (n >= from && n <= to);

  const items: PaginationItem[] = [];
  let hidden: number[] = [];
  const flush = (): void => {
    if (hidden.length === 1) items.push(Object.freeze({ type: 'page', page: hidden[0] ?? 1, current: false }));
    else if (hidden.length > 1) items.push(Object.freeze({ type: 'gap', pages: Object.freeze(hidden) }));

    hidden = [];
  };

  for (let n = 1; n <= pages; n++) {
    if (!shown(n)) {
      hidden.push(n);
      continue;
    }

    flush();
    items.push(Object.freeze({ type: 'page', page: n, current: n === page }));
  }

  flush();

  return Object.freeze(items);
}

/**
 * One item of a pagination that fits a narrow screen too: a page, shown on a narrow screen or not; or a gap, shown
 * on a wide screen (`wide`) or on a narrow one only, its menu listing its pages there (`narrowPages`).
 */
export type ResponsivePaginationItem =
  | { readonly type: 'page'; readonly page: number; readonly current: boolean; readonly narrow: boolean }
  | {
      readonly type: 'gap';
      /** The pages it hides on a wide screen (all of them for a gap shown on a narrow screen only). */
      readonly pages: readonly number[];
      /** The pages it hides on a narrow screen: its wide pages, and the siblings the narrow layout hides beside it. */
      readonly narrowPages: readonly number[];
      readonly wide: boolean;
    };

/**
 * A pagination that fits a narrow screen too: the items of both layouts at once, the wide one with its siblings and
 * the narrow one without (`siblings: 0`), each marked, for a stylesheet to show the one the screen has room for.
 * No script picks the layout, so nothing shifts once a page is hydrated.
 *
 * The narrow layout shows a subset of the wide one's pages, and each wide gap lies inside a narrow one: a gap is one
 * element in both, its menu listing, on a narrow screen, the siblings hidden beside it; only where the wide layout
 * shows every page (`1 … 7`) does the narrow one add a gap of its own.
 *
 * @param input - The current page, the number of pages, and the siblings and boundaries of the wide layout.
 * @returns Every item, in order: on a wide screen, exactly `paginationItems(input)`'s; on a narrow one, exactly
 *   `paginationItems({ ...input, siblings: 0 })`'s.
 *
 * @example
 * responsivePaginationItems({ page: 10, pages: 21 });
 * // 1, gap [2…8] (narrow [2…9]), 9 (wide only), 10 (current), 11 (wide only), gap [12…20] (narrow [11…20]), 21
 */
export function responsivePaginationItems(input: PaginationInput): readonly ResponsivePaginationItem[] {
  const wide = paginationItems(input);
  const narrow = paginationItems({ ...input, siblings: 0 });
  const narrowGaps = narrow.flatMap((item) => (item.type === 'gap' ? [item.pages] : []));
  // Each narrow gap's pages as a set: whether a gap lies in another is then linear, not quadratic.
  const narrowSets = new Map(narrowGaps.map((gap) => [gap, new Set(gap)]));
  const shownNarrow = new Set(narrow.flatMap((item) => (item.type === 'page' ? [item.page] : [])));
  const containing = (pages: readonly number[]): readonly number[] =>
    narrowGaps.find((gap) => pages.every((page) => narrowSets.get(gap)?.has(page) === true)) ?? pages;
  const keyed: { readonly key: number; readonly item: ResponsivePaginationItem }[] = wide.map((item) =>
    item.type === 'page'
      ? { key: item.page, item: Object.freeze({ ...item, narrow: shownNarrow.has(item.page) }) }
      : {
          key: item.pages[0] ?? 0,
          item: Object.freeze({ type: 'gap', pages: item.pages, narrowPages: containing(item.pages), wide: true }),
        },
  );
  // A narrow gap no wide gap lies in: the wide layout shows its pages, the narrow one hides them behind it.
  const covered = (gap: readonly number[]): boolean =>
    wide.some((item) => item.type === 'gap' && item.pages.every((page) => narrowSets.get(gap)?.has(page) === true));

  for (const gap of narrowGaps.filter((pages) => !covered(pages)))
    keyed.push({
      key: (gap.at(-1) ?? 0) + 0.5,
      item: Object.freeze({ type: 'gap', pages: gap, narrowPages: gap, wide: false }),
    });

  return Object.freeze(keyed.sort((a, b) => a.key - b.key).map(({ item }) => item));
}
