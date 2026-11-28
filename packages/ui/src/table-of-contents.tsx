'use client';

/**
 * The table of contents component: it measures the page and applies `@figatellultimate/toc`'s pure model.
 *
 * Key design decisions:
 *     - A sidebar drawer: in the margin on wide screens (the text never moves), over the content on narrow ones,
 *       closed there by default; the visitor's choice on wide screens remembered (`tocScript` applies it before the
 *       first paint).
 *     - The heading being read comes from the pure model; the component measures and never decides.
 *     - A click scrolls instantly to where its heading is the reading, mutes the measures until that scroll ends, then
 *       measures its landing; a quiet time ends a scroll where `scrollend` is missing.
 *     - Elements are reached through refs, a heading of the article by its id (the contract of its `#id` link).
 *     - Its wide breakpoint (`TOC_WIDE_MEDIA`) is not an option: the stylesheets lay the page out at it from the first
 *       paint, before any script, and a media query cannot read a custom property. One value, in the code and in the
 *       stylesheets, checked by `styles.test.ts` and `themes.test.ts`; an app changing it overrides those rules.
 *     - A followed heading (the hash, a click) that lands at the very bottom of the page, headings still after it, is
 *       nudged back up a little (`NUDGE`) and lands there anew, still current: at the very bottom, no scroll down is
 *       left to give the next headings their turns, and the reader's attempts (an overscroll's bounce) fire no scroll
 *       event.
 *     - The disclosure button sits inside the landmark it controls, first in reading order:
 *       focused from outside, a screen reader names the landmark (its title, « On this page ») before the button's
 *       own label (« Contents »), once on entering it, as it does for any landmark. Rejected: the button before the
 *       `<nav>`, and one name for both, which says the same word twice.
 *
 * Invariants (`table-of-contents.test.tsx`, `table-of-contents-layout.test.tsx` in Chromium, Firefox and WebKit):
 * reading, the bottom of the page, a hash on load, a click locking the followed heading, the range line, the panel's
 * own scroll, axe and the keyboard; its button named by its own label when given one.
 */
import {
  activeHeading,
  keptHeadings,
  scrollFor,
  tocTree,
  visibleSections,
  type Anchor,
  type Heading,
  type Reading,
  type TocNode,
} from '@figatellultimate/toc';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';

import { TOC_STORAGE_KEY as STORAGE_KEY } from './scripts.js';

/** The table of contents' own texts: no default, no English. */
export interface TableOfContentsLabels {
  /** The landmark's name, and its disclosure button's unless `toggle` names it (e.g. "Sur cette page"). */
  readonly title: string;
  /** The disclosure button's own name, an icon showing nothing to match (e.g. "Sommaire"). Default: the title. */
  readonly toggle?: string | undefined;
}

/** The table of contents' props: a `<nav>`'s, plus the headings, the labels, its side and its storage key. */
export interface TableOfContentsProps extends Omit<ComponentProps<'nav'>, 'children'> {
  /** The headings the build recorded, in document order. */
  readonly headings: readonly Heading[];
  readonly labels: TableOfContentsLabels;
  /** Default 2: the page's title is its `<h1>`. */
  readonly minDepth?: number | undefined;
  /** Default 3. */
  readonly maxDepth?: number | undefined;
  /** Where the visitor's open or closed choice is remembered on wide screens. */
  readonly storageKey?: string | undefined;
  /** The screen edge it docks against and collapses toward: the start edge by default (left, right to left). */
  readonly side?: 'start' | 'end' | undefined;
}

/**
 * Wide screens: the drawer docks in the page's margin. The stylesheet's breakpoint too (`styles.css`, and the layout
 * of `@figatellultimate/themes`' `base.css`): exported, for an app laying its own page out around it.
 */
export const TOC_WIDE_MEDIA = '(min-width: 80rem)';
/**
 * A scroll has ended after this long without a scroll event: where `scrollend` is missing (older Safari), and while a
 * click mutes the measures, so that they always resume even if a browser fires no `scrollend` after an instant scroll.
 */
const QUIET_MS = 150;
/** Past this scroll, the collapsed drawer's handle fades out of the reader's way. */
const FADE_AFTER = 200;
/**
 * How far a followed heading landed at the very bottom is nudged back up: past the model's one-pixel tolerance, so
 * that the last heading's turn, at the very bottom, is still to come.
 */
const NUDGE = 2;

interface Measured extends Reading {
  readonly visible: readonly number[];
}

/** The page as the pure model reads it: the kept headings' tops, the top dead zone, the scroll. */
function pageOf(ids: readonly string[]) {
  const elements = ids.map((id) => document.getElementById(id));
  const first = elements.find((element): element is HTMLElement => element !== null);

  if (first === undefined) return undefined;

  const viewport = window.innerHeight;

  return {
    first,
    tops: elements.map((element) => element?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY),
    // The top dead zone, from the app's stylesheet: where a followed heading lands.
    zone: Number.parseFloat(getComputedStyle(first).scrollMarginTop) || 0,
    viewport,
    scroll: window.scrollY,
    maxScroll: Math.max(0, document.documentElement.scrollHeight - viewport),
  };
}

/** What the page shows now, measured for the pure model: no magic number of its own. */
function measure(
  ids: readonly string[],
  phase: 'scroll' | 'land' | 'settle',
  direction: 'down' | 'up',
  previous: number,
  target: number | undefined,
  baseline: number | undefined,
  anchor: Anchor | undefined,
): Measured {
  const page = pageOf(ids);

  if (page === undefined)
    return { active: -1, target: undefined, baseline: undefined, anchor: undefined, done: true, visible: [] };

  return {
    ...activeHeading({
      ...page,
      phase,
      direction,
      previous: previous === -1 ? undefined : previous,
      target,
      baseline,
      anchor,
    }),
    // The last section ends with the content holding the headings.
    visible: visibleSections({
      tops: page.tops,
      end: page.first.parentElement?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
      offset: 0,
      viewport: page.viewport,
    }),
  };
}

const noSubscription = (): (() => void) => () => undefined;
const subscribeWide = (onChange: () => void): (() => void) => {
  const media = window.matchMedia(TOC_WIDE_MEDIA);

  media.addEventListener('change', onChange);

  return () => {
    media.removeEventListener('change', onChange);
  };
};

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A click that leaves the browser's own behavior alone: a modifier (a new tab, a new window) or another button. */
const modified = (event: {
  readonly defaultPrevented: boolean;
  readonly button: number;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}): boolean =>
  event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

/** The visitor's choice on wide screens, where storage works; `null` otherwise or when none was made. */
function remembered(key: string): boolean | null {
  try {
    const value = window.localStorage.getItem(key);

    return value === 'open' ? true : value === 'closed' ? false : null;
  } catch {
    return null;
  }
}

function remember(key: string, open: boolean): void {
  try {
    window.localStorage.setItem(key, open ? 'open' : 'closed');
  } catch {
    // A convenience only: without storage the table of contents still works.
  }
}

/** What following a heading needs from the component: its refs, and how to mark the current heading. */
interface Follower {
  readonly target: { current: number | undefined };
  /** From a click until its scroll ends, measures are muted. */
  readonly mute: { current: boolean };
  /** The next scroll's end is a click's landing. */
  readonly landing: { current: boolean };
  /** Ends a scroll now; and waits for one to end (a quiet time, re-armed by every scroll event while muted). */
  readonly ended: { readonly current: () => void };
  readonly quiet: { readonly current: () => void };
  readonly mark: (index: number) => void;
}

/**
 * Follows a heading: marks it current at once; scrolls instantly to its top at the top dead zone
 * (its `scroll-margin-top`), or, near the end where it cannot get there, to the scroll where its turn comes; mutes the
 * measures until that scroll ends, then measures its landing. Replaces the hash and moves focus to the heading, as a
 * native anchor would. `false` when the heading is not there.
 */
function followHeading(ids: readonly string[], index: number, follower: Follower): boolean {
  const heading = document.getElementById(ids[index] ?? '');
  const page = pageOf(ids);

  if (heading === null || page === undefined) return false;

  follower.target.current = index;
  follower.mute.current = true;
  follower.landing.current = true;
  const y = scrollFor(page, index);

  // Already there, no scroll will end: land now (no `scrollend` will fire).
  if (Math.abs(y - window.scrollY) < 1) follower.ended.current();
  else {
    window.scrollTo({ top: y, behavior: 'instant' });
    follower.quiet.current();
  }

  window.history.replaceState(window.history.state, '', `#${encodeURIComponent(heading.id)}`);

  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');

  heading.focus({ preventScroll: true });
  follower.mark(index);

  return true;
}

/**
 * The table of contents of an article.
 *
 * @param props - The entry's headings (from the build), the labels, the side it docks against (`start` by default),
 *   the depth bounds, where the visitor's choice is stored, and a `<nav>`'s props.
 * @returns A sidebar drawer docked against a screen edge, collapsing toward it, its handle staying on screen; a
 *   landmark named by its title, a nested list of real links, prerendered. While reading, the sections on screen are
 *   highlighted along a sliding line, the heading being read is `aria-current="location"` and kept visible in the
 *   list. A click, in the list or on a heading's own link in the article, follows the heading. Nothing without
 *   headings.
 *
 * @example
 * <TableOfContents headings={entry.data.headings} labels={{ title: 'Sur cette page' }} />
 */
export function TableOfContents({
  headings,
  labels,
  minDepth,
  maxDepth,
  storageKey = STORAGE_KEY,
  side = 'start',
  ...props
}: TableOfContentsProps): ReactNode {
  const tree = useMemo(() => tocTree(headings, { minDepth, maxDepth }), [headings, minDepth, maxDepth]);
  const ids = useMemo(
    () => keptHeadings(headings, { minDepth, maxDepth }).map((heading) => heading.id),
    [headings, minDepth, maxDepth],
  );
  const [active, setActive] = useState(-1);
  const [visible, setVisible] = useState<readonly number[]>([]);
  // Before hydration the stylesheet decides (open on wide screens): links work without JS.
  const mounted = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const wide = useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(TOC_WIDE_MEDIA).matches,
    () => false,
  );
  const stored = useSyncExternalStore(
    noSubscription,
    () => remembered(storageKey),
    () => null,
  );
  // The reader's choice in this mode: wide screens start from the remembered one, narrow screens closed.
  const [chosen, setChosen] = useState<{ readonly wide: boolean; readonly open: boolean } | null>(null);
  const [indicator, setIndicator] = useState<CSSProperties | undefined>(undefined);
  // A heading the reader asked for (a click, the hash): held while it is in the zone.
  const target = useRef<number | undefined>(undefined);
  // The heading current now, read by the next measure: the highlight moves from it one heading at a time.
  const current = useRef(-1);
  const mark = useCallback((index: number): void => {
    current.current = index;
    setActive(index);
  }, []);
  const mute = useRef(false);
  const landing = useRef(false);
  // What the reading gave where the followed heading landed.
  const baseline = useRef<number | undefined>(undefined);
  // Where the followed heading landed: the headings after it take their turn as they reach it.
  const anchor = useRef<Anchor | undefined>(undefined);
  const ended = useRef<() => void>(() => undefined);
  const quiet = useRef<() => void>(() => undefined);
  const follower = useMemo<Follower>(() => ({ target, mute, landing, ended, quiet, mark }), [mark]);
  // Past 200px: the collapsed drawer's handle fades.
  const [scrolled, setScrolled] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // Each link by its heading's index, set by its own ref: measured for the line and kept visible, never queried.
  const links = useRef(new Map<number, HTMLAnchorElement>());
  const titleId = useId();
  const panelId = useId();
  const open = chosen?.wide === wide ? chosen.open : wide && (stored ?? true);

  useEffect(() => {
    if (ids.length === 0) return;

    const fromHash = (): void => {
      const index = ids.indexOf(decodeURIComponent(window.location.hash.slice(1)));

      target.current = index === -1 ? undefined : index;
    };
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Which way the reader scrolls: every scroll event compares the position with the last one, muted or not.
    let direction: 'down' | 'up' = 'down';
    let last = window.scrollY;
    const track = (): void => {
      const now = window.scrollY;

      if (now !== last) direction = now > last ? 'down' : 'up';

      last = now;
      setScrolled(now >= FADE_AFTER);
    };
    const update = (phase: 'scroll' | 'land' | 'settle'): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const reading = measure(
          ids,
          phase,
          direction,
          current.current,
          target.current,
          baseline.current,
          anchor.current,
        );

        target.current = reading.target;
        baseline.current = reading.baseline;
        anchor.current = reading.anchor;
        mark(reading.active);
        setVisible((before) => (before.join() === reading.visible.join() ? before : reading.visible));

        // Landed at the very bottom with headings after it: nudged back up, muted, and landed there anew.
        const bottom = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const landed = reading.target !== undefined && reading.anchor?.index === reading.target;

        if (landed && reading.target < ids.length - 1 && bottom > NUDGE && window.scrollY >= bottom - 0.5) {
          mute.current = true;
          landing.current = true;
          window.scrollTo({ top: bottom - NUDGE, behavior: 'instant' });
          quiet.current();

          return;
        }

        // Still catching up, one heading per frame: measure again on the next one.
        if (!reading.done) update('scroll');
      });
    };

    // A scroll's end measures once more where it stops; a click's too, which updates the sections on
    // screen while the followed heading stays current.
    ended.current = (): void => {
      clearTimeout(timer);
      mute.current = false;
      update(landing.current ? 'land' : 'scroll');
      landing.current = false;
    };
    quiet.current = (): void => {
      clearTimeout(timer);
      timer = setTimeout(ended.current, QUIET_MS);
    };
    const native = 'onscrollend' in window;
    const onScroll = (): void => {
      track();

      // Without `scrollend`, or while a click mutes the measures, a quiet time ends the scroll too.
      if (!native || mute.current) quiet.current();

      if (!mute.current) update('scroll');
    };
    // The reader's own scrolling (wheel, touch, keys) never waits for a click's scroll to end.
    const unmute = (): void => {
      if (mute.current) ended.current();
    };
    const onEnd = (): void => {
      ended.current();
    };
    const onSettle = (): void => {
      update('settle');
    };
    const onHash = (): void => {
      fromHash();
      update('settle');
    };
    // A heading's own link in the article (each heading links to itself): followed the same way.
    const onClick = (event: globalThis.MouseEvent): void => {
      if (modified(event)) return;

      // The link the click went through, from the event's own path; the table's links handle themselves.
      const link = event.composedPath().find((node) => node instanceof HTMLAnchorElement);

      if (link === undefined || panel.current?.contains(link) === true) return;

      const href = link.getAttribute('href') ?? '';

      if (!href.startsWith('#')) return;

      const index = ids.indexOf(decodeURIComponent(href.slice(1)));

      if (index !== -1 && followHeading(ids, index, follower)) event.preventDefault();
    };
    // A drawer over the content (narrow screens) closes on Escape, as a menu does.
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !window.matchMedia(TOC_WIDE_MEDIA).matches) setChosen({ wide: false, open: false });
    };

    fromHash();
    update('settle');
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scrollend', onEnd);

    for (const name of ['wheel', 'touchstart', 'keydown'] as const)
      window.addEventListener(name, unmute, { passive: true });

    window.addEventListener('resize', onSettle);
    window.addEventListener('hashchange', onHash);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('scrollend', onEnd);

      for (const name of ['wheel', 'touchstart', 'keydown'] as const) window.removeEventListener(name, unmute);

      clearTimeout(timer);
      window.removeEventListener('resize', onSettle);
      window.removeEventListener('hashchange', onHash);
    };
  }, [ids, mark, follower]);

  // The line along the highlighted entries, and the current link kept visible in the panel (never scrolling the page).
  useEffect(() => {
    const track = list.current;
    const box = panel.current;

    if (track === null || box === null) return;

    const lit = visible.flatMap((index) => links.current.get(index) ?? []);
    const first = lit[0];
    const last = lit.at(-1);
    const origin = track.getBoundingClientRect();

    setIndicator(
      first === undefined || last === undefined
        ? undefined
        : {
            top: `${String(first.getBoundingClientRect().top - origin.top)}px`,
            height: `${String(last.getBoundingClientRect().bottom - first.getBoundingClientRect().top)}px`,
          },
    );
    const outer = box.getBoundingClientRect();
    const current = links.current.get(active);

    if (current === undefined || box.scrollHeight <= box.clientHeight) return;

    const inner = current.getBoundingClientRect();

    if (inner.top >= outer.top && inner.bottom <= outer.bottom) return;

    const top = box.scrollTop + (inner.top - outer.top) - (box.clientHeight - inner.height) / 2;

    box.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [active, visible, open]);

  if (ids.length === 0) return null;

  const shown = new Set(visible);
  const follow = (event: MouseEvent<HTMLAnchorElement>, index: number): void => {
    if (modified(event) || !followHeading(ids, index, follower)) return;

    event.preventDefault();

    // Over the content (a narrow screen), the drawer closes once a heading is followed.
    if (!wide) setChosen({ wide: false, open: false });
  };

  // `data-level`: the nesting level, for the stylesheet's indentation; the link itself spans the list's width.
  const items = (nodes: readonly TocNode[], level = 0): ReactNode =>
    nodes.map((node) => (
      <li key={node.id} data-slot="toc-item" data-depth={node.depth}>
        <a
          ref={(element) => {
            if (element !== null) links.current.set(node.index, element);

            return () => {
              links.current.delete(node.index);
            };
          }}
          href={`#${node.id}`}
          data-slot="toc-link"
          data-level={level}
          data-visible={shown.has(node.index) ? '' : undefined}
          aria-current={node.index === active ? 'location' : undefined}
          onClick={(event) => {
            follow(event, node.index);
          }}
        >
          {node.text}
        </a>
        {node.children.length === 0 ? null : <ol>{items(node.children, level + 1)}</ol>}
      </li>
    ));

  return (
    <nav
      aria-labelledby={titleId}
      data-slot="toc"
      data-side={side}
      data-open={mounted ? (open ? 'true' : 'false') : undefined}
      data-scrolled={scrolled ? '' : undefined}
      data-pagefind-ignore="all"
      {...props}
    >
      {/* The handle, first in reading order, drawn at the panel's inner edge: on screen when the panel is out. */}
      <button
        type="button"
        data-slot="toc-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        {...(labels.toggle === undefined ? { 'aria-labelledby': titleId } : { 'aria-label': labels.toggle })}
        onClick={() => {
          setChosen({ wide, open: !open });

          if (wide) remember(storageKey, !open);
        }}
      />
      {/* The sliding panel: its title, the list and the line along the sections on screen. */}
      <div id={panelId} ref={panel} data-slot="toc-panel">
        <p id={titleId} data-slot="toc-title">
          {labels.title}
        </p>
        <div ref={list} data-slot="toc-list">
          <span data-slot="toc-indicator" aria-hidden="true" style={indicator} hidden={indicator === undefined} />
          <ol data-slot="toc-items">{items(tree)}</ol>
        </div>
      </div>
    </nav>
  );
}
