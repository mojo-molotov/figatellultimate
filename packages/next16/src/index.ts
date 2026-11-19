/**
 * The Next.js 16 adapter: figatellultimate's framework-free results mapped onto the App Router's types. The client URL
 * adapter of faceted collections lives in its own entry, `@figatellultimate/next16/facets`.
 *
 * Key design decisions:
 *     - A mapping only: no URL, metadata or routing logic lives here; it stays in the framework-free packages, so a
 *       second framework reuses it.
 *     - Next's major version is in the package's name: a next major gets its own adapter beside this one, and apps
 *       still on Next 16 keep theirs.
 *     - figatellultimate does no routing: locale routing belongs to the app or its i18n library (e.g. next-intl, configured
 *       to match figatellultimate's URL strategy).
 *
 * Invariants (`next.test.ts`, and the example's real build): Next's own types are returned; `x-default` in the
 * languages; redirects matching their own URL only.
 */
import type { EntryMetadata, Site, SitemapEntry } from '@figatellultimate/site';
import type { Metadata, MetadataRoute, NextConfig } from 'next';

/**
 * Next 16's `Metadata` from figatellultimate's framework-free metadata.
 *
 * @param metadata - `metadataOf` or `pageMetadataOf`'s result.
 * @returns The title, description, robots, canonical, languages (`x-default` among them, as Next supports it) and
 *   Open Graph (an article's dates and tags), as Next 16 types them.
 *
 * @example
 * export async function generateMetadata(props) {
 *   const found = await findByUrl(urlOf(locale, url));
 *   return found === undefined ? {} : toNextMetadata(metadataOf(found.entry, metadataFields[found.collection], site));
 * }
 */
export function toNextMetadata(metadata: EntryMetadata): Metadata {
  const og = metadata.openGraph;
  const common = {
    url: og.url,
    locale: og.locale,
    alternateLocale: [...og.alternateLocales],
    ...(og.title === undefined ? {} : { title: og.title }),
    ...(og.description === undefined ? {} : { description: og.description }),
    ...(og.siteName === undefined ? {} : { siteName: og.siteName }),
    ...(og.images === undefined ? {} : { images: [...og.images] }),
  };
  const openGraph: NonNullable<Metadata['openGraph']> =
    og.type === 'article'
      ? {
          ...common,
          type: 'article',
          ...(og.publishedTime === undefined ? {} : { publishedTime: og.publishedTime }),
          ...(og.modifiedTime === undefined ? {} : { modifiedTime: og.modifiedTime }),
          ...(og.tags === undefined ? {} : { tags: [...og.tags] }),
        }
      : { ...common, type: 'website' };

  return {
    ...(metadata.title === undefined ? {} : { title: metadata.title }),
    ...(metadata.description === undefined ? {} : { description: metadata.description }),
    ...(metadata.robots === undefined ? {} : { robots: metadata.robots }),
    alternates: {
      canonical: metadata.canonical,
      languages: {
        ...metadata.alternates,
        ...(metadata.xDefault === undefined ? {} : { 'x-default': metadata.xDefault }),
      },
    },
    openGraph,
  };
}

/**
 * Next 16's sitemap (`app/sitemap.ts`) from figatellultimate's.
 *
 * @param entries - `sitemapOf`'s result.
 * @returns Each URL with its translations and its last modification date.
 *
 * @example
 * export default function sitemap() { return toNextSitemap(sitemapOf(mountedUrls, site)); }
 */
export function toNextSitemap(entries: readonly SitemapEntry[]): MetadataRoute.Sitemap {
  return entries.map((entry) => ({
    url: entry.url,
    ...(entry.lastModified === undefined ? {} : { lastModified: entry.lastModified }),
    alternates: { languages: { ...entry.alternates } },
  }));
}

/** The site's origin without a trailing slash, then an absolute path. */
const absolute = (site: Site, path: string): string => `${site.origin.replace(/\/+$/, '')}${path}`;

/**
 * Next 16's `robots.txt` (`app/robots.ts`).
 *
 * @param site - The site's origin.
 * @param options - The sitemap's path (default `/sitemap.xml`) and paths to disallow.
 * @returns Every crawler allowed, except the given paths, and the sitemap's absolute URL. Entries that must not be
 *   indexed say so themselves (their `robots` metadata), never here.
 *
 * @example
 * export default function robots() { return toNextRobots(site); }
 */
export function toNextRobots(
  site: Site,
  options: { readonly sitemap?: string; readonly disallow?: readonly string[] } = {},
): MetadataRoute.Robots {
  const disallow = options.disallow ?? [];

  return {
    rules: [{ userAgent: '*', allow: '/', ...(disallow.length === 0 ? {} : { disallow: [...disallow] }) }],
    sitemap: absolute(site, options.sitemap ?? '/sitemap.xml'),
  };
}

/** One permanent redirect of a migration: an old URL to its new one, as `redirects.json` lists them. */
export interface Redirect {
  readonly from: string;
  readonly to: string;
}

type NextRedirect = Awaited<ReturnType<NonNullable<NextConfig['redirects']>>>[number];

/** Characters Next's route patterns read as syntax (path-to-regexp), escaped so a URL only matches itself. */
const escapePattern = (url: string): string => url.replace(/[:()*?+{}\\]/g, (c) => `\\${c}`);

/**
 * Next 16's `redirects()` from a migration's redirect table (`redirects.json`).
 *
 * @param table - Old URL to new URL, as `figatellultimate migrate --write` writes them.
 * @returns Permanent redirects, each source escaped so that it matches its own URL only (Next reads `:`, `(`, `*`…
 *   as route syntax).
 *
 * @example
 * // next.config.ts
 * export default { redirects: async () => toNextRedirects(JSON.parse(await readFile('redirects.json', 'utf8'))) };
 */
export function toNextRedirects(table: readonly Redirect[]): NextRedirect[] {
  return table.map((redirect) => ({ source: escapePattern(redirect.from), destination: redirect.to, permanent: true }));
}
