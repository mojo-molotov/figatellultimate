'use client';

/**
 * The navbar: the site's navigation generated from the content, in the page's locale.
 *
 * Key design decisions:
 *     - Generated, never hand-written: a folder or a translation added to the content appears by itself; section
 *       labels are message keys, so a new folder breaks every locale's typecheck until its title is translated.
 *     - Menus open on a click, never on hover: Radix's hover handlers are cancelled.
 *     - A collection may ask for its sections as plain links (`menu: false`).
 *
 * Invariants (`navbar.test.tsx`, `navbar-layout.test.tsx` in real browsers): real links, the current page marked, the
 * menus by click and keyboard, the narrow screens' disclosure, axe.
 */
import { Direction, NavigationMenu } from 'radix-ui';
import { createContext, useContext, useId, useState, type ComponentProps, type ReactNode } from 'react';

import { Link } from './link.js';

/**
 * What `navigationOf(locale)` gives (`#figatellu/navigation`): an entry link, or a section labelled by a message
 * key `K` (the generated `MessageKey`).
 */
export type NavigationNode<K extends string = string> =
  { readonly kind: 'entry'; readonly url: string; readonly title: string; readonly key: string } | NavigationSection<K>;

/** A section of the navigation: a folder or a labelled collection. */
export interface NavigationSection<K extends string = string> {
  readonly kind: 'section';
  /** A message key, translated by the navbar's `t`. */
  readonly label: K;
  readonly url?: string | undefined;
  /** `false`: a link to its page instead of a menu, when it has one. */
  readonly menu?: false | undefined;
  readonly children: readonly NavigationNode<K>[];
}

/** Every text of the navbar of its own; entry titles and section labels come from the content. */
export interface NavbarLabels {
  /** The navigation landmark's accessible name. */
  readonly nav: string;
  /** The narrow-screen toggle's accessible name. */
  readonly menu: string;
}

interface NavbarContext {
  readonly items: readonly NavigationNode[];
  readonly current: string | undefined;
  /** A section's translated label: translated by the root, where its keys are still typed. */
  readonly labelOf: (node: NavigationSection) => string;
  readonly labels: NavbarLabels;
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly listId: string;
  readonly menuDepth: number;
}

const Context = createContext<NavbarContext | null>(null);

function use(part: string): NavbarContext {
  const value = useContext(Context);

  if (value === null) throw new Error(`<${part}> must be rendered inside <Navbar>.`);

  return value;
}

/**
 * Whether a node is, or holds, the current URL (`data-active` on its section): its own URL, a child's, or a page under
 * a section's URL that the navigation does not list (a blog post under its listing).
 */
const holds = (node: NavigationNode, current: string | undefined): boolean =>
  current !== undefined &&
  (node.url === current ||
    (node.kind === 'section' &&
      ((node.url !== undefined && current.startsWith(`${node.url}/`)) ||
        node.children.some((child) => holds(child, current)))));

/** The navbar's props: the navigation, the current URL, the translator, the labels, the menus' depth, extras. */
export interface NavbarProps<K extends string = string> extends Omit<
  ComponentProps<typeof NavigationMenu.Root>,
  'children' | 'dir'
> {
  /** `navigationOf(locale)`. */
  readonly items: readonly NavigationNode<K>[];
  /** The page's URL: its link gets `aria-current="page"`. */
  readonly current?: string | undefined;
  /** The app's translator for message keys (section labels), typed by them; not `translate`, an HTML attribute. */
  readonly t: (key: K) => string;
  readonly labels: NavbarLabels;
  readonly dir?: 'ltr' | 'rtl' | undefined;
  /**
   * How many levels below a section its menu lists (default: all, flat). E.g. `1`: the blog's categories only, while the
   * navigation keeps every level for the breadcrumb.
   */
  readonly menuDepth?: number | undefined;
  /** Extras after the list (the locale switcher, a search box); the parts are not replaceable here. */
  readonly children?: ReactNode;
}

/**
 * The site's navigation, generated from the content.
 *
 * @param props - The navigation tree of the page's locale (`navigationOf(locale)`), the current URL, the app's
 *   translator for section labels, the labels, how many levels a section's menu lists, the reading direction, and
 *   extras (search, locale switcher, theme toggle) as children.
 * @returns A Radix NavigationMenu (a landmark; a section's menu opens and closes on a click or the keyboard, never on
 *   hover; Escape back to the trigger), and a disclosure toggle for narrow screens.
 *
 * @example
 * <Navbar items={navigationOf(locale)} current={url} t={t} labels={{ nav: 'Navigation', menu: 'Menu' }} menuDepth={1}>
 *   <SearchDialog … /><LocaleSwitcher … /><ThemeToggle … />
 * </Navbar>
 */
export function Navbar<K extends string>({
  items,
  current,
  t,
  labels,
  dir,
  menuDepth = Number.POSITIVE_INFINITY,
  children,
  className,
  ...props
}: NavbarProps<K>): ReactNode {
  const [open, setOpen] = useState(false);
  const listId = useId();
  // Every section's label, translated here once: the parts below only see strings.
  const translated = new Map<NavigationNode, string>();
  const translate = (nodes: readonly NavigationNode<K>[]): void => {
    for (const node of nodes) {
      if (node.kind !== 'section') continue;

      translated.set(node, t(node.label));
      translate(node.children);
    }
  };

  translate(items);
  const labelOf = (node: NavigationSection): string => translated.get(node) ?? node.label;
  const root = (
    <Context value={{ items, current, labelOf, labels, open, setOpen, listId, menuDepth }}>
      <div data-slot="navbar" data-state={open ? 'open' : 'closed'} className={className}>
        <NavbarToggle />
        <NavigationMenu.Root
          aria-label={labels.nav}
          data-slot="navbar-menu"
          {...(dir === undefined ? {} : { dir })}
          {...props}
        >
          <NavigationMenu.List id={listId} data-slot="navbar-list">
            {items.map((node) => (
              <NavbarItem key={node.kind === 'entry' ? node.url : node.label} node={node} />
            ))}
          </NavigationMenu.List>
        </NavigationMenu.Root>
        {children === undefined ? null : <div data-slot="navbar-extras">{children}</div>}
      </div>
    </Context>
  );

  return dir === undefined ? root : <Direction.Provider dir={dir}>{root}</Direction.Provider>;
}

/**
 * Shows or hides the list on narrow screens (the stylesheet decides when it is visible).
 *
 * @param props - A button's props.
 * @returns A disclosure button (`aria-expanded`, `aria-controls`), named by the labels' `menu`.
 */
function NavbarToggle(props: ComponentProps<'button'>): ReactNode {
  const { labels, open, setOpen, listId } = use('NavbarToggle');

  return (
    <button
      type="button"
      data-slot="navbar-toggle"
      aria-label={labels.menu}
      aria-expanded={open}
      aria-controls={listId}
      onClick={() => {
        setOpen(!open);
      }}
      {...props}
    >
      <span data-slot="navbar-toggle-icon" aria-hidden />
    </button>
  );
}

/** Cancels a hover handler of Radix's NavigationMenu: its menus open and close on a click, not on the pointer. */
const preventHover = (event: { preventDefault: () => void }): void => {
  event.preventDefault();
};

/**
 * A top-level item: an entry link, a section with its trigger and menu, or a section as a plain link to its page.
 *
 * @param props - The node.
 * @returns The item; a section holding the current page carries `data-active`.
 */
function NavbarItem({ node }: { readonly node: NavigationNode }): ReactNode {
  const { labelOf, current } = use('NavbarItem');

  if (node.kind === 'entry') {
    return (
      <NavigationMenu.Item data-slot="navbar-item">
        <NavbarLink url={node.url}>{node.title}</NavbarLink>
      </NavigationMenu.Item>
    );
  }

  const label = labelOf(node);

  // A section without a menu is a link to its page; without a page, its menu stays the only way to its entries.
  if (node.menu === false && node.url !== undefined) {
    return (
      <NavigationMenu.Item data-slot="navbar-item" data-active={holds(node, current) ? '' : undefined}>
        <NavbarLink url={node.url}>{label}</NavbarLink>
      </NavigationMenu.Item>
    );
  }

  return (
    <NavigationMenu.Item data-slot="navbar-item" data-active={holds(node, current) ? '' : undefined}>
      {/* Named by its visible label (WCAG 2.5.3): no aria-label of its own. */}
      {/* Opened by a click (or the keyboard), never by hovering: Radix's hover handlers are cancelled. */}
      <NavigationMenu.Trigger data-slot="navbar-trigger" onPointerMove={preventHover} onPointerLeave={preventHover}>
        {label}
      </NavigationMenu.Trigger>
      <NavigationMenu.Content data-slot="navbar-content" onPointerEnter={preventHover} onPointerLeave={preventHover}>
        <NavbarSection node={node} />
      </NavigationMenu.Content>
    </NavigationMenu.Item>
  );
}

/** The links of a section, flat: its own page, then its descendants' down to `depth` levels, hoisted. */
function linksOf(
  node: NavigationSection,
  own: boolean,
  depth: number,
  labelOf: (node: NavigationSection) => string,
): { url: string; label: string }[] {
  return [
    ...(own && node.url !== undefined ? [{ url: node.url, label: labelOf(node) }] : []),
    ...(depth <= 0
      ? []
      : node.children.flatMap((child) =>
          child.kind === 'entry'
            ? [{ url: child.url, label: child.title }]
            : // A folder without a page only hands its own links over: no group, no heading, no indent.
              linksOf(child, true, child.url === undefined ? depth : depth - 1, labelOf),
        )),
  ];
}

/**
 * A section's menu: one flat list of links, like a plain menu, `menuDepth` levels deep (linked subfolders hoisted,
 * folders without a page adding nothing).
 *
 * @param props - The section.
 * @returns The list of links.
 */
function NavbarSection({ node }: { readonly node: NavigationSection }): ReactNode {
  const { labelOf, menuDepth } = use('NavbarSection');

  return (
    <ul data-slot="navbar-section">
      {linksOf(node, true, menuDepth, labelOf).map((link) => (
        <li key={link.url} data-slot="navbar-section-item">
          <NavbarLink url={link.url}>{link.label}</NavbarLink>
        </li>
      ))}
    </ul>
  );
}

/**
 * A real link, through the app's link component.
 *
 * @param props - The URL and the label.
 * @returns The link; the current page's carries `aria-current="page"` and Radix's `data-active`. Following it closes
 *   the narrow screens' menu (a client-side navigation keeps the page).
 */
function NavbarLink({ url, children }: { readonly url: string; readonly children: ReactNode }): ReactNode {
  const { current, setOpen } = use('NavbarLink');
  const active = url === current;

  return (
    <NavigationMenu.Link
      asChild
      active={active}
      // A client-side navigation keeps the page: the narrow screens' menu closes on its own link.
      onSelect={() => {
        setOpen(false);
      }}
    >
      <Link href={url} aria-current={active ? 'page' : undefined} data-slot="navbar-link">
        {children}
      </Link>
    </NavigationMenu.Link>
  );
}
