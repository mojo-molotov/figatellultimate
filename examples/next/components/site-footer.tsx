/**
 * The footer of every page: one line of links (the documentation, the blog, home), the site's theme picker, then
 * the site's name and a heart changing color; revealed from under the page.
 */
import { Hearts, Reveal } from '@figatellultimate/effects';
import { getTranslations } from 'next-intl/server';
import NextLink from 'next/link';
import type { ReactNode } from 'react';

import type { Locale } from '#figatellultimate/locales';
import { navigationOf } from '#figatellultimate/navigation';

import { site } from '../site';
import { SiteThemePicker } from './site-theme-picker';

/**
 * The footer: a link to each section of the content's navigation that has a page, then to each page at its root,
 * in this locale; then "figatellultimate · Made with ❤️". Revealed from under the page; out of the search.
 */
export async function SiteFooter({ locale }: { readonly locale: Locale }): Promise<ReactNode> {
  const t = await getTranslations({ locale });
  const items = navigationOf(locale);
  // The sections with a page (the documentation, the blog), then the pages at the root (home).
  const links = [
    ...items.flatMap((node) =>
      node.kind === 'section' && node.url !== undefined ? [{ url: node.url, label: t(node.label) }] : [],
    ),
    ...items.flatMap((node) => (node.kind === 'entry' ? [{ url: node.url, label: node.title }] : [])),
  ];

  return (
    <Reveal>
      <footer data-slot="site-footer" data-pagefind-ignore="all">
        <nav aria-label={t('ui.footer.nav')}>
          <ul data-slot="site-footer-links">
            {links.map((link) => (
              <li key={link.url}>
                <NextLink href={link.url}>{link.label}</NextLink>
              </li>
            ))}
          </ul>
        </nav>
        <SiteThemePicker
          label={t('ui.theme.site')}
          names={{ maquis: t('ui.theme.maquis'), paper: t('ui.theme.paper') }}
        />
        <p data-slot="site-footer-signature">
          {site.name} · {t('ui.footer.made')} <Hearts label={t('ui.footer.love')} />
        </p>
      </footer>
    </Reveal>
  );
}
