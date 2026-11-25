/**
 * The URL strategy: a route and a locale to a URL, built once from data and used everywhere (getters, metadata,
 * sitemap, navigation, the generated `urlOf`), so that no two call sites can compute URLs differently.
 *
 * Key design decision: the segment of a further page (`/page/2`) is the project's (`page`), as chosen with the user:
 * one name for the whole site, a name of the content's kind (lowercase letters, digits, dashes), never translated,
 * as a folder's name is not.
 *
 * Invariants: the round trip `path → descriptor → URL → descriptor`, for every strategy (`analyze.test.ts`); the
 * options resolved and validated, the page segment a name (`url.test.ts`).
 */
import type { Locales } from '../declarations/locales.js';
import { isValidName } from '../shared/names.js';
import type { EntryDescriptor } from './descriptor.js';

/** Thrown by `createUrlBuilder` on invalid options (invalid configuration is the only case where core throws). */
export class InvalidUrlOptionsError extends Error {
  override readonly name = 'InvalidUrlOptionsError';
}

/** The project's URL options: whether the default locale is prefixed, trailing slashes, and the page segment. */
export interface UrlOptions {
  /** `'implicit'` (default): the default locale is not prefixed. `'explicit'`: every locale is prefixed. */
  readonly defaultLocale?: 'implicit' | 'explicit';
  /** Default: `false`. */
  readonly trailingSlash?: boolean;
  /** The segment before a further page's number, for folder and term pages (`/blog/news/page/2`). Default: `page`. */
  readonly page?: string;
}

/** The project's single URL strategy, built once from data and used everywhere. */
export interface UrlBuilder {
  readonly locales: Locales;
  readonly options: Readonly<Required<UrlOptions>>;
  /** URL of an entry: its route, prefixed by its locale according to the options. */
  url(entry: Pick<EntryDescriptor, 'locale' | 'route'>): string;
}

/**
 * Builds the project's URL strategy.
 *
 * @param locales - The locale declaration.
 * @param options - `defaultLocale`: `implicit` (default: the default locale unprefixed) or `explicit` (every locale
 *   prefixed); `trailingSlash` (default `false`); `page`, the segment of a further page (default `page`).
 * @returns The builder: `url({ locale, route })`.
 * @throws {InvalidUrlOptionsError} On invalid options.
 *
 * @example
 * const urls = createUrlBuilder(locales);
 * urls.url({ locale: 'en', route: '/docs' }); // '/en/docs'
 * urls.url({ locale: 'fr', route: '/docs' }); // '/docs'
 */
export function createUrlBuilder(locales: Locales, options: UrlOptions = {}): UrlBuilder {
  // Validated as `unknown`: options may come from untyped config files.
  const defaultLocale: unknown = options.defaultLocale ?? 'implicit';
  const trailingSlash: unknown = options.trailingSlash ?? false;
  const page: unknown = options.page ?? 'page';

  if (defaultLocale !== 'implicit' && defaultLocale !== 'explicit') {
    throw new InvalidUrlOptionsError(
      `defaultLocale must be "implicit" or "explicit", received ${JSON.stringify(defaultLocale)}.`,
    );
  }

  if (typeof trailingSlash !== 'boolean') {
    throw new InvalidUrlOptionsError(`trailingSlash must be a boolean, received ${JSON.stringify(trailingSlash)}.`);
  }

  if (typeof page !== 'string' || !isValidName(page)) {
    throw new InvalidUrlOptionsError(
      `page must be a name (lowercase letters, digits and dashes), received ${JSON.stringify(page)}.`,
    );
  }

  const resolved = Object.freeze({ defaultLocale, trailingSlash, page });

  return Object.freeze({
    locales,
    options: resolved,
    url(entry: Pick<EntryDescriptor, 'locale' | 'route'>): string {
      const prefixed = defaultLocale === 'explicit' || entry.locale !== locales.default;
      const path = prefixed ? `/${entry.locale}${entry.route === '/' ? '' : entry.route}` : entry.route;

      return trailingSlash && !path.endsWith('/') ? `${path}/` : path;
    },
  });
}
