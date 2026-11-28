/**
 * What every content route shares: the page a request finds, below the route's base; its prerendered params are
 * `routeParamsOf` of `#figatellultimate/urls`. The app has a route per base (`splitRoutes: true`):
 * `app/[locale]/[[...url]]` for the pages, `blog/[[...url]]`, `lp` and `authors` for theirs, each one importing only
 * its own kind of page.
 */
import { hasLocale } from 'next-intl';

import { findByUrl, urlOf, type RouteBase, type UrlEntry } from '#figatellultimate/urls';

import { routing } from '../i18n/routing';

/** A content route's params: its locale, and its path below its base (absent at the base itself). */
export interface RouteParams {
  readonly locale: string;
  readonly url?: readonly string[] | undefined;
}

/**
 * The page a request finds under a route's base, if any.
 *
 * @param params - The route's params.
 * @param base - The route's base.
 * @returns The mounted page, or `undefined` for an unknown locale or URL.
 */
export async function pageAt(params: Promise<RouteParams>, base: RouteBase): Promise<UrlEntry | undefined> {
  const { locale, url = [] } = await params;

  if (!hasLocale(routing.locales, locale)) return undefined;

  return findByUrl(urlOf(locale, [...base.split('/').filter((part) => part !== ''), ...url]));
}
