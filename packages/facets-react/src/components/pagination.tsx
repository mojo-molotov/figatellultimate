'use client';

/**
 * The pagination: real links, ellipses opening menus of the hidden pages, numbers for the locale.
 *
 * Key design decisions:
 *     - Real `<a href>` links (`hrefFor`): shareable pages, middle click and new tab work; a plain click navigates
 *       through the binding, without reloading.
 *     - Each ellipsis is a Radix DropdownMenu of the hidden pages; the model is the pure
 *       `paginationItems` of `@figatellultimate/facets`.
 *     - Both layouts at once, the wide one with its siblings and a narrow one without (`responsivePaginationItems`):
 *       each item marked `data-layout="wide"` or `"narrow"` when it belongs to one only, an ellipsis's menu listing,
 *       on a narrow screen (`--fig-pagination-layout: narrow`, read as it opens), the siblings hidden beside it. The stylesheet shows the one the screen has room for, so a
 *       phone's pagination fits one line; no script picks it, and nothing shifts once hydrated.
 *     - The pages around the current one (three on each side, nearest first) are loaded ahead once it shows, and a
 *       page as the pointer, the focus or a finger reaches its link (`prefetchFor`, the URL adapter's `prefetch`): a
 *       reader moving through the list, even clicking next in a burst, never waits for the network, not even on the
 *       first visit after a deployment, when no cache holds a page yet. Rejected: the next page alone, which a burst
 *       of clicks outran.
 *     - Focus follows a page change made from the pagination: the activated link may be gone.
 *     - The pagination keeps its place on the screen after a page change made from it, so that the pointer stays on
 *       the same button: a last page holding fewer items makes the page shorter or taller above the pagination. Its
 *       place is taken on the click and restored before the new page paints, by one instant scroll (never smooth, it
 *       would be a moving target), on every device. It survives a remount: a router may mount a new page, and a new
 *       pagination, for each page (Next does, keyed by its path), so the place is kept by the module, for the
 *       pagination showing the page it was taken for. Rejected: the browser's scroll anchoring, which picks an
 *       element of its own (a post of the new page, a revealed footer) and is turned off by themes for that reason.
 *     - No style, no text of its own; numbers formatted for the locale (some locales do not use Latin digits).
 *     - No icon of its own either: the app may give previous and next one each (`icons`), shown beside their label
 *       (`pagination-step-icon`, `aria-hidden`; `pagination-step-label`), so that a stylesheet can show the icon alone
 *       on a narrow screen while the label stays the link's accessible name.
 *
 * Invariants (`components.test.tsx`): axe with an ellipsis menu open, keyboard, disabled ends, no pagination for a
 * single page, three pages on each side and the hovered or focused page loaded ahead, never past an end, a modified click left
 * to the browser, the locale's digits, the app's icons beside the steps' names; its
 * place on the screen across a page change that changes the page's height, in a real browser
 * (`pagination-layout.test.tsx`), and across Next's remount on the example (`examples/next/scripts/browse.ts`).
 *
 * Limitation: with two paginations of one listing on a page (above and below it), after a remount the first one
 * mounted takes the place, whichever was clicked.
 */
import { responsivePaginationItems, type Action } from '@figatellultimate/facets';
import { Direction, DropdownMenu, Slot } from 'radix-ui';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';

import type { FacetedCollectionBinding } from '../use-faceted-collection.js';
import { createPartContext, isPlainClick, numberFormat } from './context.js';

/**
 * The custom property a stylesheet sets to `narrow` where it shows the narrow layout (`data-layout="narrow"`), read on
 * an ellipsis as its menu opens: the breakpoint stays the stylesheet's.
 */
const LAYOUT_PROPERTY = '--fig-pagination-layout';

/**
 * How far around the current page the pagination loads pages ahead: three on each side, so that clicking next in a
 * burst keeps two clicks' lead over the network. A router keeps what it fetched: each page change asks for a page or
 * two more, a few kilobytes each.
 */
const AHEAD = [1, 2, 3] as const;

/** Every text of the pagination, visible or for assistive technologies: no default, no English. */
export interface PaginationLabels {
  /** The navigation landmark's accessible name. */
  readonly nav: string;
  readonly previous: string;
  readonly next: string;
  /** A page link's accessible name. */
  readonly page: (page: number) => string;
  /** The current page's accessible name. */
  readonly current: (page: number, pages: number) => string;
  /** An ellipsis menu's accessible name, from the pages it hides. */
  readonly more: (pages: readonly number[]) => string;
}

/** The app's icons of previous and next, e.g. arrows: decorative, beside their labels. */
export interface PaginationIcons {
  readonly previous: ReactNode;
  readonly next: ReactNode;
}

interface PaginationContext {
  readonly binding: FacetedCollectionBinding;
  readonly labels: PaginationLabels;
  readonly icons: PaginationIcons | undefined;
  readonly siblings: number;
  readonly boundaries: number;
  /** Set by a navigation from the pagination itself: focus then moves to the new current page. */
  readonly navigated: RefObject<boolean>;
  /** The current page's link, set by its own ref: focused after such a navigation. */
  readonly currentLink: RefObject<HTMLAnchorElement | null>;
  readonly go: (page: number) => (event: MouseEvent<HTMLAnchorElement>) => void;
  readonly format: (value: number) => string;
}

const { context: Context, use } = createPartContext<PaginationContext>('Pagination');

/**
 * The page change made from a pagination, until the pagination showing its page lays out: that page's `href`, and
 * where the pagination stood on the screen. Kept by the module, so that it survives the remount a router may do.
 */
let pending: { readonly href: string; readonly top: number } | undefined;

/** The pagination's props: a `<nav>`'s, plus the binding, the labels, the locale and how many pages to show. */
export interface PaginationProps extends ComponentProps<'nav'> {
  readonly binding: FacetedCollectionBinding;
  readonly labels: PaginationLabels;
  /** Formats the page numbers, e.g. the page's locale. */
  readonly locale: string;
  /** Pages shown around the current one; default 1. */
  readonly siblings?: number | undefined;
  /** Pages shown at each end; default 1. */
  readonly boundaries?: number | undefined;
  /** Reading direction of the arrow keys in the ellipsis menus (e.g. the locale's). */
  readonly dir?: 'ltr' | 'rtl' | undefined;
  /** Icons for previous and next, beside their labels; none by default. */
  readonly icons?: PaginationIcons | undefined;
}

/**
 * A pagination of real links (`hrefFor`), followed without reloading, with ellipses opening menus of the hidden pages.
 *
 * @param props - The binding, the labels, the locale (for page numbers), the siblings and boundaries (1 each), the
 *   reading direction, the icons of previous and next, and optionally the parts to compose instead of the default.
 * @returns A navigation landmark; nothing for a single page. After a page change from it, focus moves to the new
 *   current page (the link that was activated may be gone).
 *
 * @example
 * <Pagination binding={binding} labels={labels.pagination} locale="fr" />
 *
 * // composed:
 * <Pagination binding={binding} labels={labels.pagination} locale="fr">
 *   <PaginationContent>
 *     <PaginationItem><PaginationPrevious /></PaginationItem>
 *     <PaginationItem><PaginationLink page={1} /></PaginationItem>
 *     <PaginationItem><PaginationEllipsis pages={[2, 3, 4]} /></PaginationItem>
 *     <PaginationItem><PaginationNext /></PaginationItem>
 *   </PaginationContent>
 * </Pagination>
 */
export function Pagination({
  binding,
  labels,
  locale,
  siblings = 1,
  boundaries = 1,
  dir,
  icons,
  children,
  ref,
  ...props
}: PaginationProps): ReactNode {
  const nav = useRef<HTMLElement>(null);
  const currentLink = useRef<HTMLAnchorElement>(null);
  const navigated = useRef(false);
  const page = binding.state.page;
  const href = binding.hrefFor({ type: 'page', page });
  const format = useMemo(() => numberFormat(locale), [locale]);

  // Before the new page paints: the pagination back in its place on the screen, then focus on the current page.
  useLayoutEffect(() => {
    const taken = pending;

    if (taken === undefined) return;

    pending = undefined;

    if (taken.href !== href) return;

    const moved = (nav.current?.getBoundingClientRect().top ?? taken.top) - taken.top;

    if (moved !== 0) window.scrollBy({ top: moved, behavior: 'instant' });

    navigated.current = false;
    currentLink.current?.focus({ preventScroll: true });
  }, [href]);

  // The pages around this one loaded ahead once it shows, nearest first: a reader moving through the list, even
  // clicking next as fast as the pages come, never waits for the network, even on the first visit after a
  // deployment, when a page takes a third of a second to arrive (a cold cache).
  const pages = binding.view.pages;
  const { prefetchFor } = binding;

  useEffect(() => {
    for (const neighbour of AHEAD.flatMap((distance) => [page + distance, page - distance]))
      if (neighbour >= 1 && neighbour <= pages) prefetchFor({ type: 'page', page: neighbour });
  }, [page, pages, prefetchFor]);

  const go =
    (target: number) =>
    (event: MouseEvent<HTMLAnchorElement>): void => {
      if (!isPlainClick(event)) return;

      event.preventDefault();

      if (target === page) return;

      navigated.current = true;
      pending = {
        href: binding.hrefFor({ type: 'page', page: target }),
        top: nav.current?.getBoundingClientRect().top ?? 0,
      };
      binding.dispatch({ type: 'page', page: target } satisfies Action);
    };

  // A single page has nothing to navigate: no landmark, no "previous", "next" or lone "1".
  if (binding.view.pages <= 1) return null;

  const root = (
    <Context value={{ binding, labels, icons, siblings, boundaries, navigated, currentLink, go, format }}>
      <nav
        ref={(element) => {
          nav.current = element;

          if (typeof ref === 'function') return ref(element);

          if (ref) ref.current = element;

          return undefined;
        }}
        aria-label={labels.nav}
        data-slot="pagination"
        {...props}
      >
        {children ?? <PaginationContent />}
      </nav>
    </Context>
  );

  return dir === undefined ? root : <Direction.Provider dir={dir}>{root}</Direction.Provider>;
}

/**
 * The list of links.
 *
 * @param props - A list's props; `children` replace the default previous, pages and ellipses, next.
 * @returns The `<ul>`.
 */
export function PaginationContent({ children, ...props }: ComponentProps<'ul'>): ReactNode {
  const { binding, siblings, boundaries } = use('PaginationContent');

  return (
    <ul data-slot="pagination-content" {...props}>
      {children ?? (
        <>
          <PaginationItem>
            <PaginationPrevious />
          </PaginationItem>
          {responsivePaginationItems({ page: binding.state.page, pages: binding.view.pages, siblings, boundaries }).map(
            (item) =>
              item.type === 'page' ? (
                <PaginationItem key={item.page} {...(item.narrow ? {} : { 'data-layout': 'wide' })}>
                  <PaginationLink page={item.page} />
                </PaginationItem>
              ) : (
                <PaginationItem
                  key={`gap-${item.wide ? '' : 'narrow-'}${String(item.narrowPages[0])}`}
                  {...(item.wide ? {} : { 'data-layout': 'narrow' })}
                >
                  <PaginationEllipsis pages={item.pages} narrowPages={item.narrowPages} />
                </PaginationItem>
              ),
          )}
          <PaginationItem>
            <PaginationNext />
          </PaginationItem>
        </>
      )}
    </ul>
  );
}

/**
 * One item of the list.
 *
 * @param props - A list item's props.
 * @returns The `<li>`.
 */
export function PaginationItem(props: ComponentProps<'li'>): ReactNode {
  return <li data-slot="pagination-item" {...props} />;
}

interface LinkProps extends ComponentProps<'a'> {
  /** Renders the app's link component instead (e.g. Next's `<Link>`), with the same props. */
  readonly asChild?: boolean | undefined;
}

/** A page link's props: an anchor's, plus the page. */
export interface PaginationLinkProps extends LinkProps {
  readonly page: number;
}

/**
 * A real link to a page.
 *
 * @param props - The page, `asChild` to render the app's own element, and an anchor's props.
 * @returns The link, followed without reloading (a modified click is the browser's); the current page's carries
 *   `aria-current="page"` and `data-current`.
 */
export function PaginationLink({
  page,
  asChild,
  children,
  onClick,
  onPointerEnter,
  onFocus,
  ...props
}: PaginationLinkProps): ReactNode {
  const { binding, labels, go, format, currentLink } = use('PaginationLink');
  const current = page === binding.state.page;
  const Element = asChild === true ? Slot.Root : 'a';

  return (
    <Element
      {...(current ? { ref: currentLink } : {})}
      href={binding.hrefFor({ type: 'page', page })}
      aria-current={current ? 'page' : undefined}
      aria-label={current ? labels.current(page, binding.view.pages) : labels.page(page)}
      data-slot="pagination-link"
      data-current={current ? '' : undefined}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        go(page)(event);
      }}
      // The page loaded ahead as the pointer or the focus reaches it: its click shows it at once.
      onPointerEnter={(event: PointerEvent<HTMLAnchorElement>) => {
        onPointerEnter?.(event);

        if (!current) binding.prefetchFor({ type: 'page', page });
      }}
      onFocus={(event: FocusEvent<HTMLAnchorElement>) => {
        onFocus?.(event);

        if (!current) binding.prefetchFor({ type: 'page', page });
      }}
      {...props}
    >
      {children ?? format(page)}
    </Element>
  );
}

/** Previous or next: a real link, or a disabled one (`aria-disabled`, no `href`) at either end. */
function Step({
  stepSlot,
  stepPage,
  stepLabel,
  stepIcon,
  asChild,
  children,
  onClick,
  onPointerEnter,
  onFocus,
  ...props
}: LinkProps & {
  readonly stepSlot: string;
  readonly stepPage: number;
  readonly stepLabel: string;
  readonly stepIcon: ReactNode;
}): ReactNode {
  const { binding, go } = use(stepSlot);
  const enabled = stepPage >= 1 && stepPage <= binding.view.pages;
  const Element = asChild === true ? Slot.Root : 'a';

  return (
    <Element
      data-slot={stepSlot}
      {...(enabled
        ? {
            href: binding.hrefFor({ type: 'page', page: stepPage }),
            onClick: (event: MouseEvent<HTMLAnchorElement>) => {
              onClick?.(event);
              go(stepPage)(event);
            },
            onPointerEnter: (event: PointerEvent<HTMLAnchorElement>) => {
              onPointerEnter?.(event);
              binding.prefetchFor({ type: 'page', page: stepPage });
            },
            onFocus: (event: FocusEvent<HTMLAnchorElement>) => {
              onFocus?.(event);
              binding.prefetchFor({ type: 'page', page: stepPage });
            },
          }
        : { role: 'link', 'aria-disabled': true, 'data-disabled': '' })}
      {...props}
    >
      {children ??
        (stepIcon === undefined ? (
          stepLabel
        ) : (
          <>
            <span data-slot="pagination-step-icon" aria-hidden>
              {stepIcon}
            </span>
            <span data-slot="pagination-step-label">{stepLabel}</span>
          </>
        ))}
    </Element>
  );
}

/**
 * The link to the previous page.
 *
 * @param props - An anchor's props; `children` replace the label.
 * @returns A real link, or a disabled one (`aria-disabled`, no `href`) on the first page.
 */
export function PaginationPrevious(props: LinkProps): ReactNode {
  const { binding, labels, icons } = use('PaginationPrevious');

  return (
    <Step
      stepSlot="pagination-previous"
      stepPage={binding.state.page - 1}
      stepLabel={labels.previous}
      stepIcon={icons?.previous}
      {...props}
    />
  );
}

/**
 * The link to the next page.
 *
 * @param props - An anchor's props; `children` replace the label.
 * @returns A real link, or a disabled one (`aria-disabled`, no `href`) on the last page.
 */
export function PaginationNext(props: LinkProps): ReactNode {
  const { binding, labels, icons } = use('PaginationNext');

  return (
    <Step
      stepSlot="pagination-next"
      stepPage={binding.state.page + 1}
      stepLabel={labels.next}
      stepIcon={icons?.next}
      {...props}
    />
  );
}

/** An ellipsis's props: a Radix DropdownMenu trigger's, plus the pages it hides. */
export interface PaginationEllipsisProps extends ComponentProps<typeof DropdownMenu.Trigger> {
  /** The hidden pages, from `paginationItems`. */
  readonly pages: readonly number[];
  /**
   * The pages it hides on a narrow screen, from `responsivePaginationItems`: its own, and the siblings hidden beside
   * it there; its menu lists them where the stylesheet sets `--fig-pagination-layout: narrow`. Default: `pages`.
   */
  readonly narrowPages?: readonly number[] | undefined;
}

/**
 * An ellipsis' menu items, built only as the menu opens: rendered inside its content, which Radix mounts while open,
 * so that a closed menu of hundreds of hidden pages computes none of their links.
 */
function EllipsisItems({ pages }: { readonly pages: readonly number[] }): ReactNode {
  const { binding, labels, go, format } = use('PaginationEllipsis');

  return pages.map((page) => (
    <DropdownMenu.Item key={page} asChild data-slot="pagination-ellipsis-item">
      <a href={binding.hrefFor({ type: 'page', page })} aria-label={labels.page(page)} onClick={go(page)}>
        {format(page)}
      </a>
    </DropdownMenu.Item>
  ));
}

/**
 * An ellipsis: a menu button listing the pages it hides, each a real link.
 *
 * @param props - The hidden pages (and those it hides on a narrow screen), and the trigger's props; `children` replace the "…".
 * @returns The menu, named by the labels' `more`.
 */
export function PaginationEllipsis({
  pages,
  narrowPages = pages,
  children,
  ...props
}: PaginationEllipsisProps): ReactNode {
  const { labels, navigated } = use('PaginationEllipsis');
  const trigger = useRef<HTMLButtonElement>(null);
  // The layout the stylesheet shows, read as the menu opens (after hydration: nothing shifts): on a narrow screen,
  // the menu also lists the siblings hidden beside it there.
  const [narrow, setNarrow] = useState(false);
  const listed = narrow ? narrowPages : pages;

  return (
    <DropdownMenu.Root
      onOpenChange={(open) => {
        if (open && trigger.current !== null)
          setNarrow(getComputedStyle(trigger.current).getPropertyValue(LAYOUT_PROPERTY).trim() === 'narrow');
      }}
    >
      <DropdownMenu.Trigger ref={trigger} data-slot="pagination-ellipsis" aria-label={labels.more(listed)} {...props}>
        {children ?? <span aria-hidden>…</span>}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          data-slot="pagination-ellipsis-content"
          onCloseAutoFocus={(event) => {
            // The pagination moves focus to the new current page instead.
            if (navigated.current) event.preventDefault();
          }}
        >
          <EllipsisItems pages={listed} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
