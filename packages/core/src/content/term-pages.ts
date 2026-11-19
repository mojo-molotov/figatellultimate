/**
 * Term pages: a taxonomy's terms mounted like entries (an author's page), each in the locales where it is used.
 *
 * Key design decision: a term referenced by more entries than its taxonomy's page size (`pages.perPage`) is mounted
 * once per slice, its first page at its own URL, the next ones at `…/page/2`, `…/page/3`, as a folder is: each one
 * prerendered with its slice only, rather than every entry in one page (an author of thousands of posts once weighed
 * megabytes of HTML). A page is one more term page: mounted, in the sitemap, translated, checked for collisions.
 *
 * Invariants (`term-pages.test.ts`): only where a kept entry references the term; each URL once; collisions
 * reported; a term's pages by its page size.
 */
import type { Collection } from '../declarations/collection.js';
import type { Locales } from '../declarations/locales.js';
import type { Taxonomy } from '../declarations/taxonomy.js';
import type { FolderPage } from '../paths/folders.js';
import { createUrlBuilder, type UrlBuilder } from '../paths/url.js';
import { diagnostic, type TermPageCollisionDiagnostic } from '../shared/diagnostics.js';
import type { Entry } from './assemble.js';

/** A term with a page of its own, in one locale. */
export interface TermPage {
  readonly taxonomy: string;
  readonly term: string;
  readonly locale: string;
  /** URL without locale prefix (`'/authors/gustave'`, `'/authors/gustave/page/2'`). */
  readonly route: string;
  readonly url: string;
  /** Its page among the term's slices, from 1. */
  readonly page: number;
  /** How many pages the term has: 1 without a page size, or when its entries fit one page. */
  readonly pages: number;
  /** The URL of the term's first page. */
  readonly first: string;
}

/**
 * What term pages are computed from: the locales, collections, taxonomies, URL strategy and kept entries.
 *
 */
export interface TermPagesInput {
  readonly locales: Locales;
  readonly collections: Readonly<Record<string, Collection>>;
  readonly taxonomies: Readonly<Record<string, Taxonomy>>;
  /** The project's URL strategy. Default: `createUrlBuilder(locales)`. */
  readonly urls?: UrlBuilder | undefined;
  /** The entries that count: the kept ones of a build (reserved entries never do); their terms are enough. */
  readonly entries: readonly TermsOf[];
}

/** What term pages read of an entry: where it is, and the terms it references. */
export type TermsOf = Pick<Entry, 'descriptor' | 'terms'>;

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Every term page of the content.
 *
 * @param input - The locales, collections, taxonomies, URL strategy, and the kept entries (their terms).
 * @returns For each taxonomy declaring `pages`, each term at `/<base>/<term>` in each locale where a kept,
 *   non-reserved entry of any collection references it (never an empty page), then its further slices at
 *   `…/page/N` when its entries exceed `perPage`; each URL once, sorted by URL.
 *
 * @example
 * termPagesOf({ locales, collections, taxonomies, urls, entries }); // [{ taxonomy: 'authors', term: 'gustave', url: '/authors/gustave', … }]
 */
export function termPagesOf(input: TermPagesInput): readonly TermPage[] {
  const urls = input.urls ?? createUrlBuilder(input.locales);
  // Each term's first page, and the entries referencing it there (an entry naming it in two fields counts once).
  const firsts = new Map<string, { page: Omit<TermPage, 'pages'>; entries: Set<string>; perPage?: number }>();

  for (const entry of input.entries) {
    const { descriptor } = entry;

    if (descriptor.reserved) continue;

    const references = input.collections[descriptor.collection]?.references ?? {};

    for (const [field, taxonomy] of Object.entries(references)) {
      const declared = input.taxonomies[taxonomy]?.pages;

      if (declared === null || declared === undefined) continue;

      for (const term of entry.terms[field] ?? []) {
        const route = `/${declared.base}/${term}`;
        const url = urls.url({ locale: descriptor.locale, route });
        const known = firsts.get(url) ?? {
          page: { taxonomy, term, locale: descriptor.locale, route, url, page: 1, first: url },
          entries: new Set<string>(),
          ...(declared.perPage === undefined ? {} : { perPage: declared.perPage }),
        };

        known.entries.add(`${descriptor.collection}\u0000${descriptor.key}`);
        firsts.set(url, known);
      }
    }
  }

  const sliced = [...firsts.values()].flatMap(({ page, entries, perPage }): TermPage[] => {
    const pages = perPage === undefined ? 1 : Math.max(1, Math.ceil(entries.size / perPage));

    return Array.from({ length: pages }, (_, index): TermPage => {
      if (index === 0) return Object.freeze({ ...page, pages });

      const route = `${page.route}/page/${String(index + 1)}`;

      return Object.freeze({
        ...page,
        route,
        url: urls.url({ locale: page.locale, route }),
        page: index + 1,
        pages,
      });
    });
  });

  return Object.freeze(sliced.sort((a, b) => compare(a.url, b.url)));
}

/**
 * Term pages whose URL is an entry's or a folder page's: two pages at one URL, never resolved silently.
 *
 * @param pages - The term pages.
 * @param entries - The kept entries.
 * @param folders - The folder pages.
 * @param urls - The URL strategy.
 * @returns One `term-page-collision` per clash.
 */
export function termPageCollisions(
  pages: readonly TermPage[],
  entries: readonly TermsOf[],
  folders: readonly FolderPage[],
  urls: UrlBuilder,
): TermPageCollisionDiagnostic[] {
  const byUrl = new Map(pages.map((page) => [page.url, page]));
  const collision = (page: TermPage, collection: string, sourcePath: string | null): TermPageCollisionDiagnostic =>
    diagnostic({
      code: 'term-page-collision',
      severity: 'error',
      collection,
      sourcePath,
      data: { url: page.url, taxonomy: page.taxonomy, term: page.term },
      suggestions: [],
    });

  return [
    ...entries.flatMap((entry) => {
      const page = byUrl.get(urls.url(entry.descriptor));

      return page === undefined || entry.descriptor.reserved
        ? []
        : [collision(page, entry.descriptor.collection, entry.descriptor.sourcePath)];
    }),
    ...folders.flatMap((folder) => {
      const page = byUrl.get(folder.url);

      return page === undefined ? [] : [collision(page, folder.collection, null)];
    }),
  ];
}
