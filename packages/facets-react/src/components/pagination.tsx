'use client';

/**
 * The pagination: real links, ellipses opening menus of the hidden pages, numbers for the locale.
 *
 * Key design decisions:
 *     - Real `<a href>` links (`hrefFor`): shareable pages, middle click and new tab work; a plain click navigates
 *       through the binding, without reloading.
 *     - Each ellipsis is a Radix DropdownMenu of the hidden pages; the model is the pure
 *       `paginationItems` of `@figatellultimate/facets`.
 *     - Focus follows a page change made from the pagination: the activated link may be gone.
 *     - No style, no text of its own; numbers formatted for the locale (some locales do not use Latin digits).
 *     - No icon of its own either: the app may give previous and next one each (`icons`), shown beside their label
 *       (`pagination-step-icon`, `aria-hidden`; `pagination-step-label`), so that a stylesheet can show the icon alone
 *       on a narrow screen while the label stays the link's accessible name.
 *
 * Invariants (`components.test.tsx`): axe with an ellipsis menu open, keyboard, disabled ends, no pagination for a
 * single page, a modified click left to the browser, the locale's digits, the app's icons beside the steps' names.
 */
import { paginationItems, type Action } from '@figatellultimate/facets';
import { Direction, DropdownMenu, Slot } from 'radix-ui';
import {
  useEffect,
  useMemo,
  useRef,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';

import type { FacetedCollectionBinding } from '../use-faceted-collection.js';
import { createPartContext, isPlainClick, numberFormat } from './context.js';

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
  ...props
}: PaginationProps): ReactNode {
  const currentLink = useRef<HTMLAnchorElement>(null);
  const navigated = useRef(false);
  const page = binding.state.page;
  const format = useMemo(() => numberFormat(locale), [locale]);

  useEffect(() => {
    if (!navigated.current) return;

    navigated.current = false;
    currentLink.current?.focus();
  }, [page]);

  const go =
    (target: number) =>
    (event: MouseEvent<HTMLAnchorElement>): void => {
      if (!isPlainClick(event)) return;

      event.preventDefault();

      if (target === page) return;

      navigated.current = true;
      binding.dispatch({ type: 'page', page: target } satisfies Action);
    };

  // A single page has nothing to navigate: no landmark, no "previous", "next" or lone "1".
  if (binding.view.pages <= 1) return null;

  const root = (
    <Context value={{ binding, labels, icons, siblings, boundaries, navigated, currentLink, go, format }}>
      <nav aria-label={labels.nav} data-slot="pagination" {...props}>
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
          {paginationItems({ page: binding.state.page, pages: binding.view.pages, siblings, boundaries }).map(
            (item) => (
              <PaginationItem key={item.type === 'page' ? item.page : `gap-${String(item.pages[0])}`}>
                {item.type === 'page' ? <PaginationLink page={item.page} /> : <PaginationEllipsis pages={item.pages} />}
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
export function PaginationLink({ page, asChild, children, onClick, ...props }: PaginationLinkProps): ReactNode {
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
}

/**
 * An ellipsis: a menu button listing the pages it hides, each a real link.
 *
 * @param props - The hidden pages, and the trigger's props; `children` replace the "…".
 * @returns The menu, named by the labels' `more`.
 */
export function PaginationEllipsis({ pages, children, ...props }: PaginationEllipsisProps): ReactNode {
  const { binding, labels, navigated, go, format } = use('PaginationEllipsis');

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger data-slot="pagination-ellipsis" aria-label={labels.more(pages)} {...props}>
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
          {pages.map((page) => (
            <DropdownMenu.Item key={page} asChild data-slot="pagination-ellipsis-item">
              <a href={binding.hrefFor({ type: 'page', page })} aria-label={labels.page(page)} onClick={go(page)}>
                {format(page)}
              </a>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
