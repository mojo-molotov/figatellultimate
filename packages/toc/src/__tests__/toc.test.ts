import { describe, expect, it } from 'vitest';

import { activeHeading, scrollFor, tocTree, visibleSections, type Heading, type ReadingState } from '../index.js';

const h = (id: string, depth: number, text = id): Heading => ({ id, text, depth });

/** A compact picture of a tree: `id#index`, children in brackets. */
const picture = (nodes: ReturnType<typeof tocTree>): unknown =>
  nodes.map((node) =>
    node.children.length === 0
      ? `${node.id}#${String(node.index)}`
      : { [`${node.id}#${String(node.index)}`]: picture(node.children) },
  );

describe('tocTree', () => {
  it('nests each heading under the closest shallower one before it, in document order', () => {
    const tree = tocTree([h('title', 1), h('a', 2), h('a1', 3), h('a2', 3), h('b', 2), h('b1', 3)]);

    expect(picture(tree)).toEqual([{ 'a#0': ['a1#1', 'a2#2'] }, { 'b#3': ['b1#4'] }]);
  });

  it('keeps the depth bounds (default h2 to h3), the title and deeper headings left out', () => {
    expect(picture(tocTree([h('title', 1), h('a', 2), h('deep', 4), h('b', 2)]))).toEqual(['a#0', 'b#1']);
    expect(picture(tocTree([h('a', 2), h('deep', 4)], { maxDepth: 4 }))).toEqual([{ 'a#0': ['deep#1'] }]);
    expect(picture(tocTree([h('title', 1), h('a', 2)], { minDepth: 1 }))).toEqual([{ 'title#0': ['a#1'] }]);
  });

  it('a skipped level nests one level, never an empty node; a first deep heading stays at the root', () => {
    expect(picture(tocTree([h('a', 2), h('a1', 4), h('b', 2)], { maxDepth: 4 }))).toEqual([{ 'a#0': ['a1#1'] }, 'b#2']);
    expect(picture(tocTree([h('x', 3), h('a', 2)]))).toEqual(['x#0', 'a#1']);
  });

  it('leaves empty headings out, and freezes the tree', () => {
    const tree = tocTree([h('a', 2), h('blank', 2, '  '), h('b', 2)]);

    expect(picture(tree)).toEqual(['a#0', 'b#1']);
    expect(Object.isFrozen(tree)).toBe(true);
    expect(Object.isFrozen(tree[0]?.children)).toBe(true);
  });
});

/**
 * A 1000px viewport, a 64px top dead zone; the reading line at 30%, 300px. A long page scrolled to 2000 of 10,000.
 */
const state = (tops: readonly number[], extra: Partial<ReadingState> = {}): ReadingState => ({
  tops,
  zone: 64,
  viewport: 1000,
  scroll: 2000,
  maxScroll: 10_000,
  phase: 'settle',
  ...extra,
});
const active = (input: ReadingState): number => activeHeading(input).active;

describe('activeHeading: the reading line', () => {
  it.each([
    ['above the first heading: the first', state([600, 1800, 3000]), 0],
    ['a heading at the reading line is current', state([-900, 300, 1800]), 1],
    ['a subpixel below it, too', state([-900, 300.6, 1800]), 1],
    ['just below it, not yet', state([-900, 340, 1800]), 0],
    ['in a long section: the one above', state([-1500, -200, 900]), 1],
    ['at the very top: the first', state([500, 1200], { scroll: 0 }), 0],
    ['a page that does not scroll: the reading line', state([100, 280, 600], { scroll: 0, maxScroll: 0 }), 1],
    ['no heading', state([]), -1],
  ])('%s', (_, input, expected) => {
    expect(active(input)).toBe(expected);
  });
});

describe('activeHeading: the end of the page', () => {
  // Absolute tops 7800, 8400, 8700, 8900; the page scrolls to 8000. Over its last 700 px (from 7300), the reading
  // line sweeps from 300 px down to the bottom of the screen: the headings' turns come at 7400, 7700, 7850 and 7950,
  // halfway between where the line meets them and where the sweep starts.
  const at = (scroll: number): number =>
    active(
      state(
        [7800, 8400, 8700, 8900].map((top) => top - scroll),
        { scroll, maxScroll: 8000 },
      ),
    );

  it('the reading line sweeps down to the bottom of the screen: every heading takes its turn, none at the very end', () => {
    expect([7350, 7700, 7800, 7850, 7940, 7960, 8000].map(at)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });

  it('every section near the end is current over a share of the scroll, as long sections as short ones', () => {
    // A real post: six headings, the last four within the last screen; 900 px high, 1453 px of scroll.
    const tops = [344, 928, 1132, 1420, 1652, 1860];
    const turns: number[] = [];

    for (let scroll = 0; scroll <= 1453; scroll++)
      turns.push(
        active(
          state(
            tops.map((top) => top - scroll),
            { viewport: 900, scroll, maxScroll: 1453 },
          ),
        ),
      );

    const spans = tops.map((_, index) => turns.filter((current) => current === index).length);

    // Precondition: the last headings cannot reach the reading line, 270 px from the top.
    expect((tops.at(-1) ?? 0) - 1453).toBeGreaterThan(270);
    expect(Math.min(...spans)).toBeGreaterThanOrEqual(100);
  });

  it('scrollFor: a click scrolls a heading to the top dead zone, or to its turn when it cannot get there', () => {
    const page = {
      tops: [7800, 8400, 8700, 8900].map((top) => top - 2000),
      zone: 64,
      viewport: 1000,
      scroll: 2000,
      maxScroll: 8000,
    };

    // Its own top at the zone would be 7736, past the next heading's turn (7700): it stops just before it.
    expect(Math.round(scrollFor(page, 0))).toBe(7698);
    expect(Math.round(scrollFor(page, 2))).toBe(7850);
    expect(Math.round(scrollFor(page, 3))).toBe(7950);

    // Where a click lands, the reading gives that very heading.
    for (const index of [0, 1, 2, 3]) expect(at(scrollFor(page, index))).toBe(index);
  });
});

describe('activeHeading: gradual while scrolling', () => {
  // Five short sections, all on screen: the line at 300px has passed the first four.
  const short = [-40, 80, 160, 240, 900];

  it('one heading at a time from the previous one: never a jump', () => {
    expect(activeHeading(state(short, { phase: 'scroll', direction: 'down', previous: 0 }))).toEqual({
      active: 1,
      target: undefined,
      baseline: undefined,
      done: false,
    });
    expect(active(state(short, { phase: 'scroll', direction: 'down', previous: 1 }))).toBe(2);
    expect(activeHeading(state(short, { phase: 'scroll', direction: 'down', previous: 3 })).done).toBe(true);
  });

  it('only in the direction of the scroll', () => {
    expect(active(state(short, { phase: 'scroll', direction: 'up', previous: 1 }))).toBe(1);
    expect(active(state([-900, 900, 1800], { phase: 'scroll', direction: 'down', previous: 2 }))).toBe(2);
    expect(active(state([-900, 900, 1800], { phase: 'scroll', direction: 'up', previous: 2 }))).toBe(1);
  });

  it('settling (load, resize, hash) places it at once', () => {
    expect(active(state(short, { previous: 0 }))).toBe(3);
  });
});

describe('activeHeading: a followed heading (a click, the hash)', () => {
  it('where a click lands, it is current, its anchor, and the reading there is itself', () => {
    // Heading 2 is already on the reading line, but its turn comes after the landing, from the anchor.
    expect(activeHeading(state([-900, 64, 200, 900], { phase: 'land', target: 1 }))).toEqual({
      active: 1,
      target: 1,
      baseline: 1,
      anchor: { index: 1, scroll: 2000 },
      done: true,
    });
  });

  it('it holds while the reading stays what it was where it landed, whatever the direction', () => {
    const held = { phase: 'scroll', target: 1, baseline: 2, previous: 1 } as const;

    expect(active(state([-900, 40, 180, 900], { ...held, direction: 'down' }))).toBe(1);
    expect(active(state([-900, 90, 220, 900], { ...held, direction: 'up' }))).toBe(1);
  });

  it('once the reading moves on, it is released and the highlight moves from it one heading at a time', () => {
    expect(
      activeHeading(
        state([-900, -200, -60, 250], { phase: 'scroll', target: 1, baseline: 2, previous: 1, direction: 'down' }),
      ),
    ).toEqual({ active: 2, target: undefined, baseline: undefined, anchor: undefined, done: false });
  });

  it('the hash on load, out of sight: held until the scroll reaches it', () => {
    const pending = { phase: 'scroll', target: 2, direction: 'down', previous: 0 } as const;

    expect(activeHeading(state([-900, 300, 2000], pending))).toEqual({
      active: 2,
      target: 2,
      baseline: undefined,
      anchor: undefined,
      done: true,
    });
    // Reached: it lands, held from there as after a click, anchored where it landed.
    expect(activeHeading(state([-2500, -1000, 70], pending))).toEqual({
      active: 2,
      target: 2,
      baseline: 2,
      anchor: { index: 2, scroll: 2000 },
      done: true,
    });
  });

  it('the hash near the end of a short page: the heading it names, not the one the end of the page gives', () => {
    // Locales, Collections (the hash), Metadata, Folder pages, Taxonomies, Navigation; the browser scrolled as far as
    // the page goes, Collections at the top: the reading line has swept past the headings after it.
    const end = { zone: 64, viewport: 800, scroll: 500, maxScroll: 500 } as const;
    const tops = [-400, 64, 300, 450, 600, 700];

    // Precondition: the end of the page gives a later heading than the hash's.
    expect(activeHeading(state(tops, end)).active).toBeGreaterThan(1);
    expect(
      activeHeading(state(tops, { ...end, phase: 'scroll', target: 1, previous: 0, direction: 'down' })),
    ).toMatchObject({
      active: 1,
      target: 1,
      done: true,
    });
  });

  it('settling: it wins while visible, and stays pending otherwise', () => {
    expect(activeHeading(state([-900, 100, 500], { target: 2 }))).toEqual({
      active: 2,
      target: 2,
      baseline: 2,
      anchor: { index: 2, scroll: 2000 },
      done: true,
    });
    expect(activeHeading(state([-900, 100, 1500], { target: 2 }))).toEqual({
      active: 1,
      target: 2,
      baseline: undefined,
      anchor: undefined,
      done: true,
    });
  });

  it('after a hash, each following heading is current once it reaches where the hash landed, never several at once', () => {
    // Collections (index 1, the hash) landed at the top, 500 of 900 scrolled; the headings after it were all already
    // past the reading line there: from the anchor, each takes its turn as it reaches the top.
    const page = { zone: 64, viewport: 800, maxScroll: 900 } as const;
    const tops = (scroll: number) => [-400, 64, 150, 220, 300, 380].map((top) => top + 500 - scroll);
    const landed = activeHeading(state(tops(500), { ...page, scroll: 500, phase: 'land', target: 1 }));

    expect(landed).toMatchObject({ active: 1, anchor: { index: 1, scroll: 500 } });
    // Then the reader scrolls down slowly: the highlight never moves more than one heading per step, and only once
    // the scroll has gone a share of the way.
    let reading = landed;
    const seen: number[] = [];

    for (let scroll = 510; scroll <= 900; scroll += 10) {
      reading = activeHeading(
        state(tops(scroll), {
          ...page,
          scroll,
          phase: 'scroll',
          direction: 'down',
          previous: reading.active,
          target: reading.target,
          baseline: reading.baseline,
          anchor: reading.anchor,
        }),
      );
      seen.push(reading.active);
    }

    // Collections current until the next heading reaches where it landed (86 px further), then each heading in turn
    // as it reaches the top, the last at the very bottom.
    expect(seen.slice(0, 8)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(seen[9]).toBe(2);
    expect([...new Set(seen)]).toEqual([1, 2, 3, 4, 5]);
    expect(seen.at(-1)).toBe(5);
    expect(seen.every((active, i) => i === 0 || active - (seen[i - 1] ?? active) <= 1)).toBe(true);
  });

  it('settling drops the anchor: a new layout, a new reading', () => {
    const anchor = { index: 1, scroll: 2000 };

    expect(activeHeading(state([-900, 64, 200, 900], { anchor })).anchor).toBeUndefined();
  });

  it('an out-of-range target is ignored', () => {
    expect(active(state([-900, 200, 600], { target: 7 }))).toBe(1);
  });
});

describe('visibleSections', () => {
  // A section runs from its heading to the next one, the last to the end of the content (here at 2600).
  const sections = (tops: readonly number[], extra: { end?: number; offset?: number; viewport?: number } = {}) =>
    visibleSections({ tops, end: extra.end ?? 2600, offset: extra.offset ?? 0, viewport: extra.viewport ?? 1000 });

  it.each([
    ['the screen inside one long section', [-2000, -100, 3000], 3600, [1]],
    ['a screen holding several short sections', [-300, 200, 500, 900, 1400], 2600, [0, 1, 2, 3]],
    ['a heading just below the screen is not visible', [-300, 1000], 2600, [0]],
    ['a section ending exactly at the top is not visible', [-500, 0, 400], 2600, [1, 2]],
    ['the intro above the first heading: only the sections that show', [400, 1300], 2600, [0]],
    ['past the content: nothing', [-3000, -2800], -200, []],
    ['no heading', [], 2600, []],
  ] as const)('%s', (_, tops, end, expected) => {
    expect(sections(tops, { end })).toEqual(expected);
  });

  it('the reading offset (a sticky header) hides what is under it', () => {
    expect(sections([-500, 40, 600], { offset: 60 })).toEqual([1, 2]);
    expect(sections([-500, 40, 600], { offset: 0 })).toEqual([0, 1, 2]);
  });
});
