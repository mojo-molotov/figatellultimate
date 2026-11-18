/**
 * The URL strategy: a route and a locale to a URL, built once from data and used everywhere (getters, metadata,
 * sitemap, navigation, the generated `urlOf`), so that no two call sites can compute URLs differently.
 *
 * Invariant: the round trip `path → descriptor → URL → descriptor`, for every strategy (`analyze.test.ts`).
 */
import type { Locales } from '../declarations/locales.js';
import type { EntryDescriptor } from './descriptor.js';

/** Thrown by `createUrlBuilder` on invalid options (invalid configuration is the only case where core throws). */
export class InvalidUrlOptionsError extends Error {
  override readonly name = 'InvalidUrlOptionsError';
}

/** The project's URL options: whether the default locale is prefixed, and trailing slashes. */
export interface UrlOptions {
  /** `'implicit'` (default): the default locale is not prefixed. `'explicit'`: every locale is prefixed. */
  readonly defaultLocale?: 'implicit' | 'explicit';
  /** Default: `false`. */
  readonly trailingSlash?: boolean;
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
 *   prefixed); `trailingSlash` (default `false`).
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

  if (defaultLocale !== 'implicit' && defaultLocale !== 'explicit') {
    throw new InvalidUrlOptionsError(
      `defaultLocale must be "implicit" or "explicit", received ${JSON.stringify(defaultLocale)}.`,
    );
  }

  if (typeof trailingSlash !== 'boolean') {
    throw new InvalidUrlOptionsError(`trailingSlash must be a boolean, received ${JSON.stringify(trailingSlash)}.`);
  }

  const resolved = Object.freeze({ defaultLocale, trailingSlash });

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
