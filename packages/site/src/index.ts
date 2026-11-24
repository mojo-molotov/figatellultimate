/**
 * The site's helpers, pure and framework-free: metadata, sitemap, static params, locale links, navigation sections,
 * breadcrumbs, structured data, feeds and what the site exposes to LLMs (llms.txt). A framework adapter maps their results (`@figatellultimate/next16` for Next).
 *
 * Architecture:
 *     generated modules (#figatellultimate/urls, #figatellultimate/navigation) ──> these helpers ──> neutral, frozen data
 *                                                                                                   └─> toNextMetadata, toNextSitemap…
 *
 *     index.ts            metadataOf, pageMetadataOf, sitemapOf, catchAllParamsOf, localeLinksOf, sectionOf, breadcrumbOf
 *     structured-data.ts  structuredDataOf, breadcrumbListOf, personOf, jsonLd
 *     feed.ts             rssOf
 *     llms.ts             llmsTxtOf, llmsFullOf, markdownUrlOf
 *     shared.ts           absolute URLs, dates, robots, cssString
 *
 * Key design decisions:
 *     - One URL rule: every URL comes from the build (the generated modules); none is parsed or rebuilt here.
 *     - Framework-free data first, mapped by an adapter: one implementation for every framework.
 *     - Pure: results are frozen, inputs never mutated, no state kept between calls (no
 *       shared singleton, no slugger at module level).
 *     - `x-default` is the default locale's URL, and only when that translation exists; alternates list existing
 *       translations only (never `x-default` looked up in the current locale).
 *     - Frontmatter fields are read through the names a collection declares, never hard-coded per collection.
 *     - The descriptions machines read have plain spaces: the meta description, Open Graph's and the structured
 *       data's. No-break spaces are the page's typography (French spacing, written in the content and shown in its
 *       previews), not a search result's; the source keeps them, and so does the feed, which a reader reads.
 *     - The title carries the site's name (`Blog · Site`, `Site.titleTemplate`), so that a tab, a bookmark or a
 *       search result says where it comes from; the home page of each locale is the name alone, which its own title
 *       would only repeat, and so is an untitled page. Open Graph keeps the page's own title: the name is its
 *       `site_name`. Rejected: leaving it to each framework's template (Next's `title.template`), which every app
 *       would rewrite and which misses the other frameworks.
 *
 * Invariants:
 *     - Frozen results, nothing mutated, the same input gives equal output (`site.test.ts`).
 *     - `x-default` and alternates as above (`site.test.ts`).
 *     - The title, and the description's plain spaces, as above (`site.test.ts`).
 *     - Each URL gives one params object (`site.test.ts`).
 *     - The locale switcher never links a URL that is not mounted (`locale-links.test.ts`).
 *     - Breadcrumbs and sections as documented on each function (`breadcrumb.test.ts`, `section.test.ts`).
 *     - No framework, Node builtin, `process` or dependency (the `runtime` role's boundary rules).
 *
 * Limitations:
 *     - Open Graph `locale` is the declared locale code (`en`), not a region form (`en_US`).
 *     - A home page is recognized by its URL, `/` or `/<locale>`: a site mounting its home elsewhere gets the
 *       ordinary `title · name`.
 */
import type {
  EntryMetadata,
  LocaleLink,
  MetadataFields,
  MountedUrl,
  Site,
  SiteEntry,
  SiteEntryWithData,
  SitemapEntry,
} from './types.js';
import { absoluteAlternates, absoluteOn, plainSpaces, text, texts, w3cDate } from './shared.js';

export { breadcrumbListOf, jsonLd, personOf, structuredDataOf, type Person } from './structured-data.js';
export { rssOf, type FeedChannel, type FeedInput } from './feed.js';
export {
  llmsFullOf,
  llmsTxtOf,
  markdownUrlOf,
  type LlmsFullInput,
  type LlmsInput,
  type LlmsLink,
  type LlmsSection,
} from './llms.js';
export { cssString } from './shared.js';
export type {
  EntryMetadata,
  LocaleLink,
  MetadataFields,
  MountedUrl,
  Site,
  SiteEntry,
  SiteEntryWithData,
  SitemapEntry,
  StructuredData,
} from './types.js';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** The page's title with the site's name: the name alone on a locale's home page or an untitled page. */
function titleOf(title: string | undefined, entry: SiteEntry, site: Site): string | undefined {
  const { name } = site;

  if (name === undefined) return title;

  if (title === undefined || entry.url === '/' || entry.url === `/${entry.locale}`) return name;

  // A function, never a string: a replacement string reads `$$` and `$&` in the title as patterns.
  return (site.titleTemplate ?? `%s · ${name}`).replaceAll('%s', () => title);
}

/**
 * The metadata of an entry, framework-free: canonical, translations, `x-default`, robots and Open Graph.
 *
 * @param entry - A generated entry: its URL, locale, translations and frontmatter data.
 * @param fields - The frontmatter fields its collection declares (generated `metadataFields[collection]`).
 * @param site - The site's origin, name and default locale.
 * @returns Frozen metadata with absolute URLs: the title followed by the site's name (the name alone on a locale's
 *   home page), the canonical (the declared one when the entry has one, else its own
 *   URL, unprefixed for the default locale), the existing translations, `x-default` only when the default locale's
 *   translation exists, and Open Graph (an article's dates and tags when the collection's type is `article`).
 *
 * @example
 * const metadata = metadataOf(found.entry, metadataFields[found.collection], site);
 * // { title, description, canonical: 'https://example.com/en/docs', alternates: { fr: …, en: … }, xDefault, openGraph }
 */
export function metadataOf(entry: SiteEntryWithData, fields: MetadataFields, site: Site): EntryMetadata {
  const absolute = absoluteOn(site);
  const read = (field: string | undefined): unknown => (field === undefined ? undefined : entry.data[field]);
  const title = text(read(fields.title));
  // The meta description, read by search engines and link previews: the editorial typography stays on the page.
  const typeset = text(read(fields.description));
  const description = typeset === undefined ? undefined : plainSpaces(typeset);
  const image = text(read(fields.image));
  const publishedTime = text(read(fields.publishedTime));
  const modifiedTime = text(read(fields.modifiedTime));
  const tags = texts(read(fields.tags));
  const robots = text(read(fields.robots));
  const alternates = absoluteAlternates(entry, absolute);
  const xDefault = alternates[site.defaultLocale];
  // A declared canonical replaces the computed one; translations and x-default stay the build's.
  const canonical = text(read(fields.canonical)) ?? absolute(entry.url);
  const type = fields.type ?? 'website';

  const openGraph: Mutable<EntryMetadata['openGraph']> = {
    type,
    url: canonical,
    locale: entry.locale,
    alternateLocales: Object.freeze(Object.keys(alternates).filter((locale) => locale !== entry.locale)),
  };

  if (title !== undefined) openGraph.title = title;

  if (description !== undefined) openGraph.description = description;

  if (site.name !== undefined) openGraph.siteName = site.name;

  if (image !== undefined) openGraph.images = Object.freeze([absolute(image)]);

  if (type === 'article' && publishedTime !== undefined) openGraph.publishedTime = publishedTime;

  if (type === 'article' && modifiedTime !== undefined) openGraph.modifiedTime = modifiedTime;

  if (type === 'article' && tags !== undefined) openGraph.tags = tags;

  const metadata: Mutable<EntryMetadata> = {
    canonical,
    alternates: Object.freeze(alternates),
    openGraph: Object.freeze(openGraph),
  };

  const titled = titleOf(title, entry, site);

  if (titled !== undefined) metadata.title = titled;

  if (description !== undefined) metadata.description = description;

  if (robots !== undefined) metadata.robots = robots;

  if (xDefault !== undefined) metadata.xDefault = xDefault;

  return Object.freeze(metadata);
}

/** A page without frontmatter (a folder page, a term page): its place, and its own title, description and image. */
export interface PageMetadataInput extends SiteEntry {
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly image?: string | undefined;
}

/**
 * `metadataOf` for a page without frontmatter: a folder page (its translated title, its image) or a term page.
 *
 * @param page - The page's URL, locale and translations, and its title, description and image when it has them.
 * @param site - The site's origin, name and default locale.
 * @returns The same metadata as `metadataOf` would give an entry with those fields; missing ones are left out.
 *
 * @example
 * pageMetadataOf({ ...found.folder, title: 'Release notes', image: found.folder.image }, site);
 */
export function pageMetadataOf(page: PageMetadataInput, site: Site): EntryMetadata {
  const { title, description, image, ...entry } = page;
  const data = Object.fromEntries(
    Object.entries({ title, description, image }).filter(([, value]) => value !== undefined),
  );

  return metadataOf({ ...entry, data }, { title: 'title', description: 'description', image: 'image' }, site);
}

/**
 * The site's sitemap.
 *
 * @param urls - Every mounted URL (generated `mountedUrls`): URL, locale, translations, date, indexing.
 * @param site - The site's origin and default locale.
 * @returns Every indexed URL, absolute, sorted, with its translations, `x-default` when the default locale's exists,
 *   and `lastModified` (a W3C date) when it has a date; URLs whose robots forbid indexing are left out. Frozen.
 *
 * @example
 * export default function sitemap() { return toNextSitemap(sitemapOf(mountedUrls, site)); }
 */
export function sitemapOf(urls: readonly SiteEntry[], site: Site): readonly SitemapEntry[] {
  const absolute = absoluteOn(site);

  return Object.freeze(
    urls
      .filter((item) => item.indexed !== false)
      .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
      .map((item) => {
        const alternates = absoluteAlternates(item, absolute);
        const xDefault = alternates[site.defaultLocale];
        const lastModified = item.modified === undefined ? undefined : w3cDate(item.modified);

        return Object.freeze({
          url: absolute(item.url),
          alternates: Object.freeze(xDefault === undefined ? alternates : { ...alternates, 'x-default': xDefault }),
          ...(lastModified === undefined ? {} : { lastModified }),
        });
      }),
  );
}

/**
 * The static params of an optional catch-all `[[...name]]` route.
 *
 * @param urls - The URLs to prerender.
 * @param name - The route's parameter name.
 * @returns One params object per URL, its path segments under `name` (the root has none), each URL once.
 *
 * @example
 * catchAllParamsOf([{ url: '/' }, { url: '/en/docs' }], 'url'); // [{ url: [] }, { url: ['en', 'docs'] }]
 */
export function catchAllParamsOf<const N extends string>(
  urls: readonly Pick<SiteEntry, 'url'>[],
  name: N,
): readonly { readonly [K in N]: string[] }[] {
  const unique = [...new Set(urls.map((item) => item.url))];

  // One object per URL, keyed by the route's parameter name. TypeScript widens a computed key of a generic `N` to
  // `string` (`{ [x: string]: … }`): the assertion below restores the one key it holds.
  return Object.freeze(
    unique.map(
      (url) =>
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above.
        Object.freeze({ [name]: url.split('/').filter((segment) => segment !== '') }) as {
          readonly [K in N]: string[];
        },
    ),
  );
}

/** What `localeLinksOf` looks up in the mounted URLs: each one by its URL, each place, each locale's home. */
interface LocaleIndex {
  readonly byUrl: ReadonlyMap<string, MountedUrl>;
  readonly byPlace: ReadonlyMap<string, string>;
  readonly homes: ReadonlyMap<string, string>;
}

/**
 * Each URL array's index, built once: a page's links are then a few lookups, where scanning every URL for each page
 * made a build quadratic (14 s at 11,000 pages). The generated `mountedUrls` is a constant array, never mutated.
 */
const localeIndexes = new WeakMap<readonly MountedUrl[], LocaleIndex>();

const placeOf = (collection: string, key: string, locale: string): string => `${collection}\u0000${key}\u0000${locale}`;

function localeIndexOf(urls: readonly MountedUrl[]): LocaleIndex {
  const known = localeIndexes.get(urls);

  if (known !== undefined) return known;

  const byUrl = new Map<string, MountedUrl>();
  const byPlace = new Map<string, string>();
  const homes = new Map<string, string>();

  for (const item of urls) {
    // The first of a URL and of a home, as a search would find it; the last of a place, as a map of them keeps it.
    if (!byUrl.has(item.url)) byUrl.set(item.url, item);

    if (item.home === true && !homes.has(item.locale)) homes.set(item.locale, item.url);

    byPlace.set(placeOf(item.collection, item.key, item.locale), item.url);
  }

  const index = { byUrl, byPlace, homes };

  localeIndexes.set(urls, index);

  return index;
}

/**
 * Where a locale switcher leads from a URL, for each declared locale.
 *
 * Never a 404: the translation when it exists, else the nearest ancestor translated in that locale (same collection,
 * by entry key), else that locale's home (the URL the build marks `home`, its route `/`). There is no runtime
 * fallback of content, so a reader switching language
 * lands on the closest page that exists.
 *
 * @param url - The page being read.
 * @param urls - Every mounted URL (generated `mountedUrls`).
 * @param locales - The declared locales, in order.
 * @returns One link per locale that has somewhere to go, with its kind (`entry`, `ancestor`, `home`) and whether it
 *   is the current page; from a URL that is not mounted (an app route), each home.
 *
 * @example
 * localeLinksOf('/docs/advanced', mountedUrls, ['fr', 'en']);
 * // [{ locale: 'fr', url: '/docs/advanced', kind: 'entry', current: true },
 * //  { locale: 'en', url: '/en/docs', kind: 'ancestor', current: false }]
 */
export function localeLinksOf(
  url: string,
  urls: readonly MountedUrl[],
  locales: readonly string[],
): readonly LocaleLink[] {
  const { byUrl, byPlace, homes } = localeIndexOf(urls);
  const current = byUrl.get(url);
  const homeOf = (locale: string): string | undefined => homes.get(locale);
  const links = locales.flatMap((locale): LocaleLink[] => {
    const link = (target: string | undefined, kind: LocaleLink['kind']): LocaleLink[] =>
      target === undefined ? [] : [Object.freeze({ locale, url: target, kind, current: target === url })];

    if (current === undefined) return link(homeOf(locale), 'home').map((l) => Object.freeze({ ...l, current: false }));

    const translation = current.locale === locale ? current.url : current.alternates[locale];

    if (translation !== undefined) return link(translation, 'entry');

    const parts = current.key.split('/');

    for (let length = parts.length - 1; length > 0; length--) {
      const ancestor = byPlace.get(placeOf(current.collection, parts.slice(0, length).join('/'), locale));

      if (ancestor !== undefined) return link(ancestor, 'ancestor');
    }

    return link(homeOf(locale), 'home');
  });

  return Object.freeze(links);
}

/** A paginated listing in each locale that has it: its first page's URL and its count of pages. */
export type ListingLocales = Readonly<Record<string, { readonly first: string; readonly pages: number }>>;

/**
 * A paginated listing in each locale that has it, from its first page's translations: what `pageLocaleLinks` reads.
 *
 * @param first - The listing's first page in the page's locale: its first page, its pages and its translations.
 * @param find - Its kind of page at a URL (a folder, a term's page), e.g. the generated `findBlogFolderByUrl`.
 * @returns Each locale's first page and count of pages; a translation `find` does not know is left out.
 *
 * @example
 * const listing = listingLocalesOf(findBlogFolderByUrl(folder.first) ?? folder, findBlogFolderByUrl);
 */
export function listingLocalesOf<
  P extends {
    readonly first: string;
    readonly pages: number;
    readonly alternates: Readonly<Partial<Record<string, string>>>;
  },
>(first: P, find: (url: string) => P | undefined): ListingLocales {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(first.alternates).flatMap(([locale, url]) => {
        const there = url === undefined ? undefined : find(url);

        return there === undefined ? [] : [[locale, Object.freeze({ first: there.first, pages: there.pages })]];
      }),
    ),
  );
}

/**
 * Where a locale switcher leads from a page of a paginated listing shown in the browser (`usePagedCollection`'s
 * batches): the page moved, the server's links did not. The same rules as `localeLinksOf`'s, from the page's number:
 * that page in a locale that has it, else the listing's first page there (its nearest translated ancestor); a locale
 * without the listing keeps the server's link.
 *
 * @param links - The server's links, for the page the reader landed on (`localeLinksOf`).
 * @param at - The current page and locale, the listing in each locale, and how a page's URL is built from its first
 *   page's (`pagedHref` of `@figatellultimate/facets`).
 * @returns The links for the current page, in the same order.
 *
 * @example
 * pageLocaleLinks(links, { page: 4, locale: 'fr', listing, href: (first, page) => pagedHref(first, `?page=${page}`) });
 */
export function pageLocaleLinks(
  links: readonly LocaleLink[],
  at: {
    readonly page: number;
    readonly locale: string;
    readonly listing: ListingLocales;
    readonly href: (first: string, page: number) => string;
  },
): readonly LocaleLink[] {
  return Object.freeze(
    links.map((link): LocaleLink => {
      const there = at.listing[link.locale];

      if (there === undefined) return link;

      const has = at.page <= there.pages;
      const url = has ? at.href(there.first, at.page) : there.first;

      return Object.freeze({
        locale: link.locale,
        url,
        kind: has ? 'entry' : 'ancestor',
        current: link.locale === at.locale && has,
      });
    }),
  );
}

/**
 * A node of the generated `#figatellultimate/navigation`: an entry link, or a section labelled by a message key `K` (the
 * generated `MessageKey`, kept through every helper below so that `t` receives it as is).
 */
export type NavigationNode<K extends string = string> =
  { readonly kind: 'entry'; readonly url: string; readonly title: string; readonly key: string } | NavigationSection<K>;

/** A section of the navigation: a folder or a labelled collection. */
export interface NavigationSection<K extends string = string> {
  readonly kind: 'section';
  /** A message key, translated by the app. */
  readonly label: K;
  /** Its page, when it has one; a section without a page has no link. */
  readonly url?: string | undefined;
  /** `false` when its collection asks for a plain link instead of a menu. */
  readonly menu?: false | undefined;
  readonly children: readonly NavigationNode<K>[];
}

/**
 * The section a page opens: e.g. `/docs` lists its pages after its body.
 *
 * @param items - The navigation tree of the page's locale.
 * @param url - The page's URL.
 * @returns The section whose URL is the page's own, at any depth, with its children; `undefined` for any other URL.
 *
 * @example
 * sectionOf(navigationOf('fr'), '/docs')?.children; // the documentation's pages and subsections
 */
export function sectionOf<K extends string>(
  items: readonly NavigationNode<K>[],
  url: string,
): NavigationSection<K> | undefined {
  for (const node of items) {
    if (node.kind !== 'section') continue;

    if (node.url === url) return node;

    const below = sectionOf(node.children, url);

    if (below !== undefined) return below;
  }

  return undefined;
}

/** A page next to another in its section: its URL and title. */
export interface Neighbour {
  readonly url: string;
  readonly title: string;
}

/**
 * The pages before and after a page in its section, in the navigation's order: a documentation's previous and next
 * links.
 *
 * @param items - The navigation tree of the page's locale.
 * @param url - The page's URL.
 * @returns The entries right before and after the page among its section's entries (subsections skipped), each
 *   `undefined` at an end; both `undefined` for a page the navigation does not list.
 *
 * @example
 * const { previous, next } = neighboursOf(navigationOf('fr'), '/docs/configuration');
 * // previous: { url: '/docs/installation', title: 'Installation' }
 */
export function neighboursOf<K extends string>(
  items: readonly NavigationNode<K>[],
  url: string,
): { readonly previous: Neighbour | undefined; readonly next: Neighbour | undefined } {
  const entries = items.filter((node) => node.kind === 'entry');
  const index = entries.findIndex((node) => node.url === url);

  if (index !== -1) {
    const neighbour = (node: NavigationNode<K> | undefined): Neighbour | undefined =>
      node?.kind === 'entry' ? { url: node.url, title: node.title } : undefined;

    return { previous: neighbour(entries[index - 1]), next: neighbour(entries[index + 1]) };
  }

  for (const node of items) {
    if (node.kind !== 'section') continue;

    const found = neighboursOf(node.children, url);

    if (found.previous !== undefined || found.next !== undefined) return found;

    if (node.children.some((child) => child.kind === 'entry' && child.url === url)) return found;
  }

  return { previous: undefined, next: undefined };
}

/** One step of a breadcrumb: a message key to translate (a section) or a title (an entry, the page itself). */
export type Crumb<K extends string = string> = (
  { readonly message: true; readonly label: K } | { readonly message: false; readonly label: string }
) & {
  /** A link when the step has a page; a section without one is plain text. */
  readonly url?: string | undefined;
  readonly current: boolean;
};

const crumbOf = <K extends string>(node: NavigationNode<K>, current: boolean): Crumb<K> =>
  node.kind === 'entry'
    ? { label: node.title, message: false, url: node.url, current }
    : { label: node.label, message: true, url: node.url, current };

/** The chain of nodes from the root to the first node `found` accepts, depth first. */
function chainTo<K extends string>(
  nodes: readonly NavigationNode<K>[],
  found: (node: NavigationNode<K>) => boolean,
): NavigationNode<K>[] | undefined {
  for (const node of nodes) {
    if (found(node)) return [node];

    if (node.kind === 'section') {
      const below = chainTo(node.children, found);

      if (below !== undefined) return [node, ...below];
    }
  }

  return undefined;
}

/**
 * The breadcrumb of a URL in a navigation tree, built with the page (static, real links).
 *
 * @param items - The navigation tree of the page's locale.
 * @param url - The page's URL.
 * @param title - The page's title, for a page the navigation does not list (e.g. a blog post).
 * @returns The home first (the root entry of key `''`), then the sections down to the page; a page the navigation
 *   does not list hangs from the deepest section whose URL prefixes its own (never a mere prefix of a name), then its
 *   title. The current step is marked; nothing more for the home alone.
 *
 * @example
 * breadcrumbOf(navigationOf('fr'), '/blog/news/launch', 'Launch');
 * // Accueil › Blog › News › Launch (current)
 */
export function breadcrumbOf<K extends string>(
  items: readonly NavigationNode<K>[],
  url: string,
  title?: string,
): readonly Crumb<K>[] {
  const home = items.find((node) => node.kind === 'entry' && node.key === '');
  const crumbs: Crumb<K>[] = home === undefined ? [] : [crumbOf(home, home.url === url)];

  if (home?.url === url) return crumbs;

  const exact = chainTo(items, (node) => node.url === url);

  if (exact !== undefined) return [...crumbs, ...exact.map((node, i) => crumbOf(node, i === exact.length - 1))];

  // Not listed: the deepest section holding it by URL.
  let deepest: NavigationNode<K>[] = [];
  const visit = (nodes: readonly NavigationNode<K>[], chain: NavigationNode<K>[]): void => {
    for (const node of nodes) {
      if (node.kind !== 'section') continue;

      const next = [...chain, node];
      const holds = node.url !== undefined && url.startsWith(`${node.url}/`);

      if (holds && next.length > deepest.length) deepest = next;

      visit(node.children, next);
    }
  };

  visit(items, []);
  const trail = deepest.map((node) => crumbOf(node, false));
  const last: readonly Crumb<K>[] = title === undefined ? [] : [{ label: title, message: false, url, current: true }];

  return [...crumbs, ...trail, ...last];
}
