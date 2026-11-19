'use client';

/**
 * The locale switcher: never a 404, since its links come from `localeLinksOf`.
 *
 * Invariants (`locale-switcher.test.tsx`): real links in their own language, the current one marked, axe, the
 * keyboard, right-to-left.
 */
import { Direction, DropdownMenu, VisuallyHidden } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';

import { Link } from './link.js';

/** What `localeLinksOf` gives (`@figatellultimate/site`). */
export interface LocaleLink {
  readonly locale: string;
  readonly url: string;
  readonly kind: 'entry' | 'ancestor' | 'home';
  readonly current: boolean;
}

/** Every text of the switcher of its own; locale names come from the locales' declaration. */
export interface LocaleSwitcherLabels {
  /** Read before the current locale's name by assistive technologies, e.g. "Language". */
  readonly language: string;
}

/** The switcher's props: a Radix DropdownMenu root's, plus the links, the names, the labels and the direction. */
export interface LocaleSwitcherProps extends Omit<ComponentProps<typeof DropdownMenu.Root>, 'children' | 'dir'> {
  /** `localeLinksOf(url, mountedUrls, locales)`. */
  readonly links: readonly LocaleLink[];
  /** A locale's name, e.g. `(locale) => localeInfo[locale].label`. */
  readonly names: (locale: string) => string;
  /** The page's locale (for the trigger), when no link is current (an app route). */
  readonly locale?: string | undefined;
  readonly labels: LocaleSwitcherLabels;
  readonly dir?: 'ltr' | 'rtl' | undefined;
  readonly className?: string | undefined;
}

/**
 * The page in another locale: a Radix DropdownMenu of real links, one per locale.
 *
 * @param props - The links (`localeLinksOf`), each locale's name in its own language, the current locale, the
 *   labels, the reading direction, and the menu's props.
 * @returns The menu: its trigger shows the current locale's name; each item is a link named in its own language
 *   (`lang`, `hrefLang`); where the page is not translated, the link leads to the nearest translated section, silently.
 *
 * @example
 * <LocaleSwitcher links={localeLinksOf(url, mountedUrls, locales)} names={(l) => localeInfo[l].label} locale={locale}
 *   labels={{ language: 'Langue :' }} />
 */
export function LocaleSwitcher({
  links,
  names,
  locale,
  labels,
  dir,
  className,
  ...props
}: LocaleSwitcherProps): ReactNode {
  const current = links.find((link) => link.current)?.locale ?? locale ?? links[0]?.locale ?? '';
  const menu = (
    <DropdownMenu.Root {...(dir === undefined ? {} : { dir })} {...props}>
      <DropdownMenu.Trigger data-slot="locale-switcher" className={className}>
        {/* "Language Français": the visible name is part of the accessible one (WCAG 2.5.3). */}
        <VisuallyHidden.Root>{labels.language} </VisuallyHidden.Root>
        <span data-slot="locale-switcher-current" lang={current}>
          {names(current)}
        </span>
        <span data-slot="locale-switcher-icon" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content data-slot="locale-switcher-content" align="end">
          {links.map((link) => (
            <DropdownMenu.Item key={link.locale} asChild data-slot="locale-switcher-item">
              <Link
                href={link.url}
                hrefLang={link.locale}
                aria-current={link.current ? 'page' : undefined}
                data-current={link.current ? '' : undefined}
                data-kind={link.kind}
              >
                {/* The name in its own language. */}
                <span data-slot="locale-switcher-name" lang={link.locale}>
                  {names(link.locale)}
                </span>
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );

  return dir === undefined ? menu : <Direction.Provider dir={dir}>{menu}</Direction.Provider>;
}
