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

import { REPOSITORY_URL, site } from '../site';
import { SiteThemePicker } from './site-theme-picker';

/**
 * The footer: a link to each section of the content's navigation that has a page, then to each page at its root,
 * in this locale; then "figatellultimate · Made with ❤️". Revealed from under the page; out of the search.
 */
export async function SiteFooter({ locale }: { readonly locale: Locale }): Promise<ReactNode> {
  const t = await getTranslations({ locale });
  // A theme option as spoken, as the light and dark toggle says its own: what it is, or what a press does.
  const spokenOf = (name: string) => ({
    on: t('ui.theme.pick.on', { name }),
    choose: t('ui.theme.pick.choose', { name }),
    unknown: t('ui.theme.pick.unknown', { name }),
  });
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
          spoken={{ maquis: spokenOf(t('ui.theme.maquis')), paper: spokenOf(t('ui.theme.paper')) }}
        />
        <p data-slot="site-footer-signature">
          {site.name} · {t('ui.footer.made')} <Hearts label={t('ui.footer.love')} />
        </p>
        <div data-slot="site-footer-repo">
          <a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer" aria-label="GitHub">
            <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor" aria-hidden>
              <path d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12c0 4.64 3.01 8.58 7.18 9.97.53.1.72-.23.72-.5 0-.25-.01-1.08-.01-1.95-2.92.63-3.54-1.24-3.54-1.24-.48-1.21-1.17-1.53-1.17-1.53-.95-.65.07-.64.07-.64 1.05.07 1.61 1.08 1.61 1.08.94 1.6 2.46 1.14 3.06.87.09-.68.37-1.14.67-1.4-2.33-.26-4.78-1.17-4.78-5.19 0-1.15.41-2.08 1.08-2.82-.11-.26-.47-1.33.1-2.78 0 0 .88-.28 2.89 1.08a10.1 10.1 0 0 1 5.26 0c2.01-1.36 2.89-1.08 2.89-1.08.57 1.45.21 2.52.1 2.78.67.74 1.08 1.67 1.08 2.82 0 4.03-2.46 4.92-4.8 5.18.38.33.71.97.71 1.95 0 1.41-.01 2.55-.01 2.9 0 .28.19.61.72.5A10.51 10.51 0 0 0 22.5 12C22.5 6.2 17.8 1.5 12 1.5Z" />
            </svg>
          </a>
        </div>
      </footer>
    </Reveal>
  );
}
