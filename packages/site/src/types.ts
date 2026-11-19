/**
 * The site helpers' types: structural, so that any generated entry, index item or mounted URL fits without a cast.
 */
/**
 * The published site: its origin, its name, and the default locale (for `x-default`).
 *
 * @example
 * const site: Site = { origin: 'https://example.com', name: 'figatellultimate', defaultLocale };
 */
export interface Site {
  /** E.g. `'https://example.com'`, without a trailing slash (one is tolerated). */
  readonly origin: string;
  /** Open Graph `site_name`, and what follows every page's title (see `titleTemplate`). */
  readonly name?: string | undefined;
  /**
   * How a page's title carries the site's name, `%s` standing for the page's title: `'%s · <name>'` by default.
   * Without a name, a page's title stays alone.
   */
  readonly titleTemplate?: string | undefined;
  readonly defaultLocale: string;
}

/** What the helpers read of a generated entry or index item: structural, any collection. */
export interface SiteEntry {
  /** As the build produced it, unprefixed for the default locale. */
  readonly url: string;
  readonly locale: string;
  /** Existing translations, URL by locale (generated). */
  readonly alternates: Readonly<Partial<Record<string, string>>>;
  /** Its modification date, else its publication date (generated): the sitemap's `lastmod`. */
  readonly modified?: string | undefined;
  /** `false` when its robots directives forbid indexing (generated): left out of the sitemap. */
  readonly indexed?: boolean | undefined;
}

/** A mounted URL, as `#figatellultimate/urls` lists them (`mountedUrls`): what the locale switcher reads. */
export interface MountedUrl extends SiteEntry {
  readonly collection: string;
  /** The entry key, locale-independent: ancestors are its prefixes. */
  readonly key: string;
}

/** Where the locale switcher leads for one locale. */
export interface LocaleLink {
  readonly locale: string;
  readonly url: string;
  /** `entry`: the translation; `ancestor`: the nearest translated section; `home`: that locale's home. */
  readonly kind: 'entry' | 'ancestor' | 'home';
  readonly current: boolean;
}

/** A generated entry, with its frontmatter data. */
export interface SiteEntryWithData extends SiteEntry {
  readonly data: Readonly<Record<string, unknown>>;
}

/** The frontmatter fields a collection declares for its metadata, as generated in `metadataFields`. */
export interface MetadataFields {
  readonly title?: string;
  readonly description?: string;
  readonly image?: string;
  readonly publishedTime?: string;
  readonly modifiedTime?: string;
  readonly tags?: string;
  readonly robots?: string;
  readonly canonical?: string;
  readonly type?: 'website' | 'article';
  readonly schema?: 'WebPage' | 'Article' | 'BlogPosting' | 'TechArticle' | 'NewsArticle';
}

/** Framework-free metadata of an entry: absolute URLs, frozen. */
export interface EntryMetadata {
  readonly title?: string;
  readonly description?: string;
  /** Unprefixed for the default locale, or the entry's declared canonical. */
  readonly canonical: string;
  /** The entry's robots directives, e.g. `'noindex'`. */
  readonly robots?: string;
  /** Existing translations only, absolute URL by locale. */
  readonly alternates: Readonly<Record<string, string>>;
  /** The default locale's URL, only when that translation exists. */
  readonly xDefault?: string;
  readonly openGraph: {
    readonly type: 'website' | 'article';
    readonly url: string;
    readonly locale: string;
    readonly alternateLocales: readonly string[];
    readonly title?: string;
    readonly description?: string;
    readonly siteName?: string;
    readonly images?: readonly string[];
    readonly publishedTime?: string;
    readonly modifiedTime?: string;
    readonly tags?: readonly string[];
  };
}

/** One sitemap URL with its translations, `x-default` included when the default locale's exists. */
export interface SitemapEntry {
  readonly url: string;
  readonly alternates: Readonly<Record<string, string>>;
  /** A W3C date, when the page has one. */
  readonly lastModified?: string;
}

/** A schema.org object, ready for `jsonLd`. */
export interface StructuredData {
  readonly '@context'?: 'https://schema.org';
  readonly '@type': string;
  readonly [property: string]: unknown;
}
