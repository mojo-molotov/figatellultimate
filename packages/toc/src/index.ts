// prettier-ignore
/**
 * The table of contents model: the tree of an entry's headings, the heading being read, where a click scrolls, and
 * the sections on screen. Pure and DOM-free: `TableOfContents` (`@figatellultimate/ui`) measures the page and renders.
 *
 * Architecture:
 *     headings (from the build) ──> keptHeadings ──> tocTree                    the list to render
 *     measures (tops, scroll…)  ──> activeHeading ──> { active, done, … }      the highlight
 *                               ──> scrollFor                                   a click's destination
 *                               ──> visibleSections                             the range on screen
 *
 * Reading model:
 *     scroll ─────────────────────────────────────────────┬─────────────────────> maxScroll
 *       │ h0 │ h1 (top at the reading line) │ h2 │ …       │ hN-2 │ hN-1 │ hN │
 *                 the line at 30% of the screen            the last screen of scroll: the line sweeps down to
 *                                                          the bottom, each section's turn in proportion to it
 *
 * Key design decisions:
 *     - The headings are computed at build time, with the same ids as the HTML: the table of contents is prerendered
 *       and its links work without JavaScript.
 *     - Pure functions on measured tops: the behavior (no mutable refs, direction enum or magic numbers) becomes
 *       functions tested on tables of cases.
 *     - A reading line in the upper third, each heading getting its turn even at the end of the page, and one heading
 *       at a time in the scroll's direction: a slow scroll steps, it never jumps.
 *     - At the end of the page, the line sweeps down to the bottom of the screen over the last screen of scroll,
 *       rather than the headings that cannot reach it sharing what scroll is left: that share could be a few pixels
 *       when the last reachable heading is close to the bottom, and a section was then skipped. With the sweep, each
 *       section near the end is current over a stretch in proportion to its length.
 *     - A click lands where its heading is the reading, so the highlight never moves on by itself afterwards.
 *
 * Invariants (all checked by `toc.test.ts`, tables of cases):
 *     - `tocTree`: the kept headings in document order, each under the closest shallower one before it; never an empty
 *       node; `index` is `0..n-1`; frozen.
 *     - `activeHeading` is total, `-1` only without headings; it moves one heading at a time while scrolling; every
 *       section near the end of a page is current over a share of the scroll.
 *     - `scrollFor` lands where `activeHeading` gives the clicked heading; it is total too, a finite scroll within
 *       `[0, maxScroll]` for any page and any anchor, an unusable anchor ignored as `activeHeading` ignores it (a
 *       property).
 *     - `visibleSections`: the sections overlapping the screen.
 *     - No DOM, framework, Node builtin or dependency (the `runtime` role's boundary rules).
 */
/**
 * A heading as the build recorded it, in document order (e.g. by `rehypeHeadings` of
 * `@figatellultimate/content-collections`, which sets the same `id` in the HTML).
 */
export interface Heading {
  readonly id: string;
  readonly text: string;
  /** 1 to 6, as `<h1>` to `<h6>`. */
  readonly depth: number;
}

/** A heading of the table of contents, with the headings nested under it. */
export interface TocNode {
  readonly id: string;
  readonly text: string;
  readonly depth: number;
  /** Its index in the flat list of kept headings: what `activeHeading` answers. */
  readonly index: number;
  readonly children: readonly TocNode[];
}

/** Which heading levels a table of contents keeps. */
export interface TocOptions {
  /** Default 2: the page's title is its `<h1>`. */
  readonly minDepth?: number | undefined;
  /** Default 3. */
  readonly maxDepth?: number | undefined;
}

interface Building {
  readonly heading: Heading;
  readonly index: number;
  readonly children: Building[];
}

const freeze = (node: Building): TocNode =>
  Object.freeze({
    id: node.heading.id,
    text: node.heading.text,
    depth: node.heading.depth,
    index: node.index,
    children: Object.freeze(node.children.map(freeze)),
  });

/**
 * The headings a table of contents keeps.
 *
 * @param headings - The entry's headings, in document order.
 * @param options - The depth bounds; default `<h2>` to `<h3>`.
 * @returns The headings within the bounds and with some text, in document order.
 *
 * @example
 * keptHeadings([{ id: 'a', text: 'A', depth: 1 }, { id: 'b', text: 'B', depth: 2 }]); // [B]
 */
export function keptHeadings(headings: readonly Heading[], options: TocOptions = {}): readonly Heading[] {
  const min = options.minDepth ?? 2;
  const max = options.maxDepth ?? 3;

  return headings.filter((heading) => heading.depth >= min && heading.depth <= max && heading.text.trim() !== '');
}

/**
 * The kept headings as a tree: a heading nests under the closest shallower one before it; a skipped level nests one
 * level, never an empty node.
 *
 * @param headings - The entry's headings, in document order.
 * @param options - The depth bounds; default `<h2>` to `<h3>`.
 * @returns The roots, each with its children, frozen; `index` numbers the kept headings `0..n-1`.
 *
 * @example
 * tocTree([{ id: 'a', text: 'A', depth: 2 }, { id: 'b', text: 'B', depth: 3 }]);
 * // [{ id: 'a', index: 0, children: [{ id: 'b', index: 1, children: [] }] }]
 */
export function tocTree(headings: readonly Heading[], options: TocOptions = {}): readonly TocNode[] {
  const roots: Building[] = [];
  const stack: Building[] = [];

  keptHeadings(headings, options).forEach((heading, index) => {
    while ((stack.at(-1)?.heading.depth ?? 0) >= heading.depth) stack.pop();

    const node: Building = { heading, index, children: [] };

    (stack.at(-1)?.children ?? roots).push(node);
    stack.push(node);
  });

  return Object.freeze(roots.map(freeze));
}

/** What a component measured (pixels; tops relative to the viewport's top). */
export interface ReadingState {
  /** Each kept heading's top, in `index` order. */
  readonly tops: readonly number[];
  /** The top dead zone: the headings' `scroll-margin-top` (e.g. a sticky navbar's height). */
  readonly zone: number;
  readonly viewport: number;
  /** The page's scroll position, and its largest. */
  readonly scroll: number;
  readonly maxScroll: number;
  /** `scroll` while the reader scrolls; `land` where a click's scroll stops; `settle` on load, resize and hash change. */
  readonly phase: 'scroll' | 'land' | 'settle';
  /** Which way the reader scrolls; `down` when unknown. */
  readonly direction?: 'down' | 'up' | undefined;
  /** The heading current before this measure: while scrolling, the highlight moves from it one heading at a time. */
  readonly previous?: number | undefined;
  /** A heading the reader asked for (a click, the hash). */
  readonly target?: number | undefined;
  /** What the reading gave where the followed heading landed: it holds until the reading moves on. */
  readonly baseline?: number | undefined;
  /** Where a followed heading landed (the hash, a click): the headings after it take their turns from there. */
  readonly anchor?: Anchor | undefined;
}

/** Where a followed heading landed: its index, and the scroll it landed at. */
export interface Anchor {
  readonly index: number;
  readonly scroll: number;
}

/** The heading being read; the followed heading still held, and the reading where it landed; whether it caught up. */
export interface Reading {
  readonly active: number;
  readonly target: number | undefined;
  readonly baseline: number | undefined;
  /** Where the followed heading landed, kept for the next measures; `undefined` once the layout settles anew. */
  readonly anchor: Anchor | undefined;
  /** `false` while the highlight is still catching up with the reading, one heading per measure: measure again. */
  readonly done: boolean;
}

/**
 * The reading line, as a share of the viewport from its top: where the eyes are while reading down. The upper third,
 * as the docs sites with the most precise tables of contents.
 */
export const READING_LINE = 0.3;

/** A heading scrolled to a place lands there give or take a subpixel. */
const TOLERANCE = 1;

interface Page {
  readonly tops: readonly number[];
  readonly zone: number;
  readonly viewport: number;
  readonly scroll: number;
  readonly maxScroll: number;
  readonly anchor?: Anchor | undefined;
}

/**
 * An anchor the headings can use: a heading's index (an integer within them) and a finite scroll; `undefined`
 * otherwise, as if none. The library makes its anchors; any other one is ignored, never spread to a reading or a scroll.
 */
function usableAnchor(anchor: Anchor | undefined, count: number): Anchor | undefined {
  return anchor !== undefined &&
    Number.isInteger(anchor.index) &&
    anchor.index >= 0 &&
    anchor.index < count &&
    Number.isFinite(anchor.scroll)
    ? anchor
    : undefined;
}

/**
 * Where each heading becomes current, as a scroll position: when its top reaches the reading line, which sweeps down
 * to the bottom of the screen over the last screen of scroll (`turns`). A slow scroll gives each its turn.
 *
 * Once a followed heading landed (the anchor: a hash, a click), the headings after it become current when they reach
 * where it landed, the top dead zone, instead of the reading line: opened on `#section`, the page reads from there,
 * each following heading taking its turn as it reaches the top, never several at the first scroll.
 */
function activations({ tops, zone, viewport, scroll, maxScroll, anchor }: Page): number[] {
  const atLine = turns(tops, scroll, maxScroll, Math.max(zone, viewport * READING_LINE), viewport);

  if (anchor === undefined) return atLine;

  return anchored(
    atLine,
    tops.map((top) => top + scroll - zone),
    anchor,
    maxScroll,
  );
}

/**
 * The turns once a followed heading landed (the anchor): the headings before it keep theirs; its own has come where
 * it landed; each one after it comes when its top reaches the top dead zone, where the anchor landed, and those that
 * never can (the page ends first) share the rest of the page evenly from the anchor (or the last one after it that
 * can), the last one at the very bottom.
 */
function anchored(atLine: readonly number[], atZone: readonly number[], anchor: Anchor, maxScroll: number): number[] {
  const after = (index: number): boolean => index > anchor.index;
  const reachable = atZone.map((at, index) => after(index) && at <= maxScroll);
  const lastReachable = reachable.lastIndexOf(true);
  const from = Math.max(anchor.scroll, lastReachable === -1 ? anchor.scroll : (atZone[lastReachable] ?? anchor.scroll));
  const sharing = atZone.map((at, index) => after(index) && at > maxScroll);
  const count = sharing.filter(Boolean).length;
  let rank = 0;

  return atLine.map((position, index) => {
    if (index < anchor.index) return position;

    if (index === anchor.index) return Math.min(position, anchor.scroll);

    if (reachable[index] === true) return Math.max(atZone[index] ?? position, anchor.scroll + TOLERANCE * 2);

    rank += 1;

    return from + ((maxScroll - from) * rank) / count;
  });
}

/**
 * Where each heading's turn comes when its top reaches the line (pixels from the viewport's top): `line`, then, over
 * the last stretch of scroll, a line sweeping down to the bottom of the screen, so that every heading of the last
 * screen reaches it before the page ends.
 *
 *     the sweep starts at `from` (the bottom of the page less the distance from the line to the screen's bottom);
 *     from there the line goes down by `slope` px per px of scroll: a heading whose top is `at` px of scroll below
 *     the line meets it at `(at + slope × from) / (1 + slope)`, its section's share of the sweep in proportion to it
 */
function turns(tops: readonly number[], scroll: number, maxScroll: number, line: number, viewport: number): number[] {
  const natural = tops.map((top) => top + scroll - line);
  const sweep = Math.max(0, viewport - line);
  const from = Math.max(0, maxScroll - sweep);

  if (maxScroll <= 0 || sweep === 0 || from >= maxScroll) return natural;

  const slope = sweep / (maxScroll - from);

  return natural.map((at) => (at <= from ? at : Math.min(maxScroll, (at + slope * from) / (1 + slope))));
}

/** The heading the reading gives at this scroll: the last one whose turn has come, the first at the very top. */
function reading(page: Page): number {
  if (page.maxScroll > 0 && page.scroll <= 0) return 0;

  const at = activations(page);
  let reached = 0;

  at.forEach((position, index) => {
    if (page.scroll >= position - TOLERANCE) reached = index;
  });

  return reached;
}

/**
 * Where a click on a heading scrolls: its top at the top dead zone; a heading that can never get there (the page ends
 * first), to the scroll where its turn comes; never past the next heading's turn, so that where it lands the reading
 * gives that very heading.
 *
 * @param page - The headings' tops, the dead zone, the viewport, the scroll and its largest value.
 * @param index - The heading clicked, an index of the kept headings.
 * @returns A scroll position within `[0, maxScroll]`; the current one for an unknown index.
 *
 * @example
 * window.scrollTo({ top: scrollFor({ tops, zone, viewport, scroll: window.scrollY, maxScroll }, 3) });
 */
export function scrollFor(page: Page, index: number): number {
  const top = page.tops[index];

  if (top === undefined) return page.scroll;

  const anchor = usableAnchor(page.anchor, page.tops.length);
  const at = activations(anchor === undefined ? { ...page, anchor: undefined } : page);
  const own = top + page.scroll - page.zone;
  const turn = at[index] ?? own;
  const next = at[index + 1];
  let y = own <= page.maxScroll ? own : turn;

  if (next !== undefined) y = Math.max(turn, Math.min(y, next - 2 * TOLERANCE));

  return Math.max(0, Math.min(page.maxScroll, y));
}

/**
 * The heading being read.
 *
 * - The reading: the last heading whose turn has come (its top at the reading line, which sweeps down to the bottom
 *   of the screen over the last screen of scroll), the first at the very top.
 * - While scrolling, from the previous heading, one heading at a time and only in the scroll's direction: a slow
 *   scroll moves the highlight to the next heading or back to the previous one, never jumps; `done` is `false` while
 *   it is still catching up, so the caller measures again on the next frame.
 * - A followed heading (a click, the hash) stays current from where it landed until the reading moves on from there,
 *   then the highlight moves from it one heading at a time. The hash on load, out of sight, holds until the scroll
 *   reaches it, and lands there, even when the reading is already past it (near the end of a page).
 * - Where a followed heading landed is the anchor of the headings after it: each becomes current when it reaches
 *   that place (the top dead zone) instead of the reading line, so that a hash near the end of a page never hands
 *   the highlight to several headings at the first scroll. A new layout (settling) drops it.
 * - Settling (load, resize, hash change) places it at once.
 *
 * @param state - What the component measured, the phase, and what it knew before (previous, target, baseline,
 *   anchor).
 * @returns The current heading (`-1` only without headings), the followed heading still held, the reading where it
 *   landed, the anchor to keep, and whether the highlight caught up.
 *
 * @example
 * const reading = activeHeading({ tops, zone, viewport, scroll, maxScroll, phase: 'scroll', direction, previous });
 * if (!reading.done) requestAnimationFrame(measure);
 */
export function activeHeading(state: ReadingState): Reading {
  const { tops, phase, direction = 'down' } = state;

  if (tops.length === 0) return { active: -1, target: undefined, baseline: undefined, anchor: undefined, done: true };

  const last = tops.length - 1;
  const valid = (index: number | undefined): index is number =>
    index !== undefined && Number.isInteger(index) && index >= 0 && index <= last;
  // Settling (load, resize) measures a new layout: an earlier landing's scroll means nothing there.
  const anchor = phase !== 'settle' ? usableAnchor(state.anchor, tops.length) : undefined;
  const candidate = reading({ ...state, anchor });
  const target = valid(state.target) ? state.target : undefined;

  if (target !== undefined) {
    // Landed here: the anchor of the headings after it; the reading there is the heading itself.
    const land = (): Reading => {
      const at = { index: target, scroll: state.scroll };

      return { active: target, target, baseline: reading({ ...state, anchor: at }), anchor: at, done: true };
    };
    const top = tops[target] ?? Number.NaN;

    if (phase === 'land' || (phase === 'settle' && top >= 0 && top < state.viewport)) return land();

    if (phase === 'scroll') {
      // Landed: held until the reading moves on from where it landed.
      if (state.baseline !== undefined && candidate === state.baseline)
        return { active: target, target, baseline: state.baseline, anchor, done: true };

      // Not landed yet (the hash on load, out of sight): held until the scroll reaches it, then landed there, as
      // after a click, even when the reading would already be past it (near the end of a page).
      if (state.baseline === undefined) {
        const reached = direction === 'down' ? candidate >= target : candidate <= target;

        return reached ? land() : { active: target, target, baseline: undefined, anchor, done: true };
      }
    }
  }

  const pending = target !== undefined && phase === 'settle' ? target : undefined;
  const previous = valid(state.previous) ? state.previous : undefined;

  if (phase !== 'scroll' || previous === undefined)
    return { active: candidate, target: pending, baseline: undefined, anchor, done: true };

  // One heading at a time, only in the direction of the scroll: never a jump, never against the reader's intent.
  const step =
    direction === 'down'
      ? Math.min(previous + 1, Math.max(previous, candidate))
      : Math.max(previous - 1, Math.min(previous, candidate));

  return { active: step, target: undefined, baseline: undefined, anchor, done: step === candidate };
}

/** What a component measured to tell which sections show (pixels, relative to the viewport's top). */
export interface SectionsState {
  /** Each kept heading's top, in `index` order: a section runs from its heading to the next one. */
  readonly tops: readonly number[];
  /** Where the last section ends: the bottom of the content. */
  readonly end: number;
  /** What is hidden at the top (a sticky header); `0` without one. */
  readonly offset: number;
  readonly viewport: number;
}

/**
 * The sections visible on screen: each runs from its heading to the next one, the last one to `end`.
 *
 * @param state - The headings' tops, the content's end, what a sticky header hides, the viewport's height.
 * @returns The indexes of the sections overlapping `[offset, viewport)`, in order, frozen.
 *
 * @example
 * visibleSections({ tops: [-400, 120, 900], end: 1500, offset: 64, viewport: 800 }); // [0, 1]
 */
export function visibleSections(state: SectionsState): readonly number[] {
  const { tops, end, offset, viewport } = state;

  return Object.freeze(
    tops.flatMap((top, index) => {
      const bottom = tops[index + 1] ?? end;

      return top < viewport && bottom > offset ? [index] : [];
    }),
  );
}
