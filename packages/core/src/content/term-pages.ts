/**
 * Term pages: a taxonomy's terms mounted like entries (an author's page), each in the locales where it is used.
 *
 * Invariants (`term-pages.test.ts`): only where a kept entry references the term; each URL once; collisions
 * reported.
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
  /** URL without locale prefix (`'/authors/gustave'`). */
  readonly route: string;
  readonly url: string;
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
 *   non-reserved entry of any collection references it (never an empty page), each URL once, sorted by URL.
 *
 * @example
 * termPagesOf({ locales, collections, taxonomies, urls, entries }); // [{ taxonomy: 'authors', term: 'gustave', url: '/authors/gustave', … }]
 */
export function termPagesOf(input: TermPagesInput): readonly TermPage[] {
  const urls = input.urls ?? createUrlBuilder(input.locales);
  const pages = new Map<string, TermPage>();

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

        if (!pages.has(url)) {
          pages.set(url, Object.freeze({ taxonomy, term, locale: descriptor.locale, route, url }));
        }
      }
    }
  }

  return Object.freeze([...pages.values()].sort((a, b) => compare(a.url, b.url)));
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
