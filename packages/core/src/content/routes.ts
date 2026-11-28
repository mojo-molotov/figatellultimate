// prettier-ignore
/**
 * The app's routes, when it splits them (`splitRoutes: true`): one route per base, each serving the collections and
 * the term pages mounted under it, the empty base being the root route that serves the rest.
 *
 *     collections and term pages ──> routesOf ──> '' (root) · 'authors' · 'blog' · 'lp'
 *     every mounted page         ──> routeShadowings ──> `route-shadowed` for a page another route's prefix takes
 *
 * Key design decisions:
 *     - A route per base, not per collection: collections sharing a base share a route, so that splitting never
 *       forbids a layout the content already has.
 *     - The check reads the content only, never the app's files: a framework's router answers a path from its most
 *       specific route, so a page under another route's prefix (`/blog/about`, a page of the root route, under the
 *       blog's `blog/`) would be answered by that route, which does not know it: a 404. The longest base that is a
 *       path prefix of a page's route is the one serving it; any other than its own is a shadowing.
 *     - Prefixes by whole segments: `/blogging` is under the root route, not the blog's.
 *
 * Invariants (`routes.test.ts`, `load.test.ts`): one route per base, unmounted collections and taxonomies without
 * pages left out; every entry, folder page and term page checked, a reserved entry left to its dedicated route;
 * checked only when the routes are split.
 */
import type { Collection } from '../declarations/collection.js';
import type { Taxonomy } from '../declarations/taxonomy.js';
import type { EntryDescriptor } from '../paths/descriptor.js';
import type { FolderPage } from '../paths/folders.js';
import type { UrlBuilder } from '../paths/url.js';
import { diagnostic, type RouteShadowedDiagnostic } from '../shared/diagnostics.js';
import type { TermPage } from './term-pages.js';

/** One route of a split app: its base, and the collections and taxonomies whose pages it serves. */
export interface Route {
  /** The URL prefix it serves, without locale (`'blog'`); `''` for the root route. */
  readonly base: string;
  readonly collections: readonly string[];
  readonly taxonomies: readonly string[];
}

/** The segments of a base or a route, empty ones dropped (`''` and `'/'` have none). */
const segmentsOf = (path: string): string[] => path.split('/').filter((segment) => segment !== '');

/**
 * The routes of a split app: one per base of a mounted collection or of a taxonomy's pages.
 *
 * @param collections - The declared collections; unmounted ones serve no page.
 * @param taxonomies - The declared taxonomies; those without pages serve none.
 * @returns The routes, sorted by base, the root one (`''`) first when any collection is based there.
 *
 * @example
 * routesOf({ pages, blog }, { authors }); // [{ base: '', … }, { base: 'authors', … }, { base: 'blog', … }]
 */
export function routesOf(
  collections: Readonly<Record<string, Collection>>,
  taxonomies: Readonly<Record<string, Taxonomy>>,
): readonly Route[] {
  const bases = new Map<string, { collections: string[]; taxonomies: string[] }>();
  const at = (base: string) => bases.get(base) ?? bases.set(base, { collections: [], taxonomies: [] }).get(base);

  for (const [name, collection] of Object.entries(collections))
    if (collection.mounted) at(collection.base)?.collections.push(name);

  for (const [name, taxonomy] of Object.entries(taxonomies))
    if (taxonomy.pages !== null) at(taxonomy.pages.base)?.taxonomies.push(name);

  return Object.freeze(
    [...bases.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([base, served]) =>
        Object.freeze({
          base,
          collections: Object.freeze(served.collections),
          taxonomies: Object.freeze(served.taxonomies),
        }),
      ),
  );
}

/** What `routeShadowings` reads: the declarations, and every page the build mounts. */
export interface RouteShadowingsInput {
  readonly collections: Readonly<Record<string, Collection>>;
  readonly taxonomies: Readonly<Record<string, Taxonomy>>;
  /** The kept entries' descriptors; a reserved entry, served by a dedicated route, is not checked. */
  readonly entries: readonly EntryDescriptor[];
  readonly folders: readonly FolderPage[];
  readonly terms: readonly TermPage[];
  /** The project's URL strategy: an entry's URL, as a diagnostic shows it. */
  readonly urls: UrlBuilder;
}

/**
 * The pages a split app would not serve: each one under another route's prefix, which answers its path first.
 *
 * @param input - The collections, the taxonomies, the kept entries, folder pages and term pages, and the URL strategy.
 * @returns One `route-shadowed` error per such page, entries first, then folder pages, then term pages.
 *
 * @example
 * routeShadowings({ collections, taxonomies, entries, folders, terms, urls });
 * // [{ code: 'route-shadowed', collection: 'pages', sourcePath: 'blog/about.mdx', data: { url: '/blog/about', route: '', shadowedBy: 'blog' }, … }]
 */
export function routeShadowings(input: RouteShadowingsInput): RouteShadowedDiagnostic[] {
  const { collections, taxonomies } = input;
  // Longest first: the first base a route starts with is the one serving it.
  const bases = routesOf(collections, taxonomies)
    .map((route) => route.base)
    .sort((a, b) => segmentsOf(b).length - segmentsOf(a).length);
  const servingOf = (route: string): string | undefined => {
    const path = segmentsOf(route);

    return bases.find((base) => segmentsOf(base).every((segment, index) => path[index] === segment));
  };
  const check = (
    own: string,
    route: string,
    url: string,
    collection: string,
    sourcePath: string | null,
  ): RouteShadowedDiagnostic[] => {
    const serving = servingOf(route);

    return serving === undefined || serving === own
      ? []
      : [
          diagnostic({
            code: 'route-shadowed',
            severity: 'error',
            collection,
            sourcePath,
            data: { url, route: own, shadowedBy: serving },
            suggestions: [],
          }),
        ];
  };

  return [
    ...input.entries.flatMap((entry) => {
      const collection = collections[entry.collection];

      return entry.reserved || collection === undefined || !collection.mounted
        ? []
        : check(collection.base, entry.route, input.urls.url(entry), entry.collection, entry.sourcePath);
    }),
    ...input.folders.flatMap((folder) => {
      const collection = collections[folder.collection];

      return collection === undefined ? [] : check(collection.base, folder.route, folder.url, folder.collection, null);
    }),
    ...input.terms.flatMap((page) => {
      const pages = taxonomies[page.taxonomy]?.pages;

      return pages === undefined || pages === null ? [] : check(pages.base, page.route, page.url, page.taxonomy, null);
    }),
  ];
}
