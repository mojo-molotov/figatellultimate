/**
 * The 404 of each locale: an unknown URL gets a page of the site, in its language, with the navigation, the theme and
 * the footer, titled like every page (`Page introuvable · Figatellultimate`), and a link to the locale's home, over
 * a faint, vignetted cover faded in, in the dark theme only (`Backdrop`; laid out by `@figatellultimate/themes/base.css`).
 *
 * Key design decision: the catch-all route lets unknown URLs through (`dynamicParams = true`), so that `notFound()`
 * renders this page inside the locale's layout; every mounted URL stays prerendered, and the status stays a real 404
 * with `noindex`. Rejected: Next's global 404 (`global-not-found`, experimental), one static page outside every
 * layout, without the navigation, whose language could only be guessed in the browser.
 *
 * Checked by `scripts/browse.ts`: the status, the language, the title, the link home and the backdrop, in each locale.
 *
 * Limitation: a URL the locale proxy does not route (one with an extension, e.g. `/nope.txt`) gets Next's own 404.
 */
import { hasLocale } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import NextLink from 'next/link';
import type { ReactNode } from 'react';

import { defaultLocale } from '#figatellultimate/locales';
import { urlOf } from '#figatellultimate/urls';

import { SiteBackdrop } from '../../components/backdrop';
import { SiteHeader } from '../../components/site-header';
import { routing } from '../../i18n/routing';
import { site } from '../../site';

/**
 * The page an unknown URL of a locale gets.
 *
 * @returns Its title, the site's header, and a short text with a link to the locale's home.
 */
export default async function NotFound(): Promise<ReactNode> {
  const requested = await getLocale();
  const locale = hasLocale(routing.locales, requested) ? requested : defaultLocale;
  const t = await getTranslations({ locale });
  const home = urlOf(locale, []);
  const title = t('ui.notFound.title');

  return (
    <>
      {/* React puts it in the head: Next's not-found file takes no metadata of its own. */}
      <title>{site.name === undefined ? title : `${title} · ${site.name}`}</title>
      {/* Nothing of the navigation is current; the locale switcher offers the other locales' home pages. */}
      <SiteHeader locale={locale} url="" translates={home} breadcrumb={false} />
      <main data-page="not-found">
        <h1>{title}</h1>
        <p>{t('ui.notFound.text')}</p>
        <p>
          <NextLink href={home}>{t('ui.notFound.home')}</NextLink>
        </p>
        <SiteBackdrop src="/covers/placeholder-151.jpeg" />
      </main>
    </>
  );
}
