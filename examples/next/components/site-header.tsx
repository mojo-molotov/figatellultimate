/** The header of every page and its breadcrumb, from the content's navigation. */
import { SEARCH_SORTS } from '@figatellu/search';
import { breadcrumbOf, localeLinksOf } from '@figatellu/site';
import type { NavigationNode } from '@figatellu/ui';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { locales, type Locale } from '#figatellu/locales';
import type { MessageKey } from '#figatellu/messages';
import { navigationOf } from '#figatellu/navigation';
import { mountedUrls } from '#figatellu/urls';

import { compiled } from '../i18n/labels';
import { Crumbs } from './crumbs';
import { HeaderBar, type HeaderLabels } from './header-bar';

/** The navigation with its sections' labels translated: the client header receives text, not message keys. */
const translated = (items: readonly NavigationNode<MessageKey>[], t: (key: MessageKey) => string): NavigationNode[] =>
  items.map((item) =>
    item.kind === 'entry' ? item : { ...item, label: t(item.label), children: translated(item.children, t) },
  );

/** Every text of the client header, formatted here; the two that take a count, precompiled. */
async function headerLabels(locale: Locale): Promise<HeaderLabels> {
  const ui = await getTranslations({ locale, namespace: 'ui' });

  return {
    navbar: { nav: ui('navbar.nav'), menu: ui('navbar.menu') },
    search: {
      trigger: ui('search.trigger'),
      title: ui('search.title'),
      close: ui('search.close'),
      input: ui('search.input'),
      placeholder: ui('search.placeholder'),
      results: ui('search.results'),
      searching: ui('search.searching'),
      unavailable: ui('search.unavailable'),
      more: ui('search.more'),
      sortTrigger: ui('search.sort.trigger'),
      sorts: Object.fromEntries(SEARCH_SORTS.map((sort) => [sort, ui(`search.sort.${sort}`)])),
      collections: { pages: ui('collections.pages'), blog: ui('collections.blog') },
      tooShort: await compiled(locale, 'ui.search.tooShort'),
      found: await compiled(locale, 'ui.search.found'),
    },
    language: ui('locales.language'),
    dark: ui('theme.dark'),
  };
}

/**
 * The header of every page (server): the navbar generated from the content in the page's locale, the locale
 * switcher's links and every label, passed as data to the client header; the breadcrumb, rendered here.
 */
export async function SiteHeader({
  locale,
  url,
  title,
  breadcrumb,
  crumbs = url,
}: {
  readonly locale: Locale;
  readonly url: string;
  /** The URL the breadcrumb reads, when not the page's: a folder's further page shows its first page's. */
  readonly crumbs?: string | undefined;
  /** The page's title, the breadcrumb's last step when the navigation does not list it (a blog post). */
  readonly title?: string | undefined;
  /** `false`: the page places the breadcrumb itself (`PageCrumbs`), e.g. a post with its table of contents. */
  readonly breadcrumb?: boolean | undefined;
}): Promise<ReactNode> {
  const items = navigationOf(locale);
  const t = await getTranslations({ locale });

  return (
    <header>
      <HeaderBar
        locale={locale}
        url={url}
        items={translated(items, (key) => t(key))}
        links={localeLinksOf(url, mountedUrls, locales)}
        labels={await headerLabels(locale)}
      />
      {/* Static: computed with the page, real links. */}
      {breadcrumb === false ? null : <Crumbs locale={locale} crumbs={breadcrumbOf(items, crumbs, title)} />}
    </header>
  );
}

/** The breadcrumb alone, for a page that places it in its content (server: the steps are computed with the page). */
export function PageCrumbs({
  locale,
  url,
  title,
}: {
  readonly locale: Locale;
  readonly url: string;
  readonly title?: string | undefined;
}): ReactNode {
  return <Crumbs locale={locale} crumbs={breadcrumbOf(navigationOf(locale), url, title)} />;
}
