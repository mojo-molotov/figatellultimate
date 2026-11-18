/**
 * Folder pages: a collection's folders mounted like entries (a category, a subcategory), each in the locales where
 * it holds content. Their data is neutral; the app renders them.
 *
 * Key design decision: a folder holding more items than its level's page size (`folderPages.perPage`) is mounted
 * once per slice, its first page at its own URL, the next ones at `…/page/2`, `…/page/3`: each one prerendered with
 * its slice only, rather than every item in one page. Its items are its entries when no named segment lies below it,
 * else its subfolders. A page is one more folder page: mounted, in the sitemap, translated, checked for collisions.
 *
 * Invariants (`folders.test.ts`): only where an entry is kept; each URL once; an entry at a folder page's URL is a
 * collision, a slice's included; a folder's pages by its page size.
 */
import type { Collection } from '../declarations/collection.js';
import type { Locales } from '../declarations/locales.js';
import type { EntryDescriptor } from './descriptor.js';
import { createUrlBuilder, type UrlBuilder } from './url.js';

/** A folder with a page of its own, in one locale. */
export interface FolderPage {
  readonly collection: string;
  readonly locale: string;
  /** `null` for the collection's own page, else the segment whose folders this level is. */
  readonly level: string | null;
  /** The folder's segment values, in grammar order (empty for the root). */
  readonly segments: Readonly<Record<string, string>>;
  /** URL without locale prefix (`'/blog/patch-notes'`). */
  readonly route: string;
  readonly url: string;
  /** Its page among the folder's slices, from 1. */
  readonly page: number;
  /** How many pages the folder has: 1 without a page size, or when it holds no more than one page. */
  readonly pages: number;
  /** The URL of the folder's first page: its own. */
  readonly first: string;
}

/** What `folderPagesOf` reads: the declarations, the URL strategy and the kept entries. */
export interface FolderPagesInput {
  readonly locales: Locales;
  readonly collections: Readonly<Record<string, Collection>>;
  /** The project's URL strategy. Default: `createUrlBuilder(locales)`. */
  readonly urls?: UrlBuilder | undefined;
  /** The entries that count: the kept ones of a build (reserved entries never do). */
  readonly entries: readonly EntryDescriptor[];
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Every folder page of the content.
 *
 * @param input - The locales, the collections, the URL strategy, and the kept entries' descriptors.
 * @returns For each collection declaring `folderPages`, its root and the folders of its levels, in each locale where
 *   they hold a kept, unreserved entry (no fallback of content), each URL once, sorted by URL.
 *
 * @example
 * folderPagesOf({ locales, collections, urls, entries }); // [{ collection: 'blog', url: '/blog', level: null, … }, …]
 */
export function folderPagesOf(input: FolderPagesInput): readonly FolderPage[] {
  const urls = input.urls ?? createUrlBuilder(input.locales);
  const pages = new Map<string, FolderPage>();

  for (const entry of input.entries) {
    if (entry.reserved) continue;

    const collection = input.collections[entry.collection];
    const declared = collection?.folderPages;

    if (collection === undefined || declared === null || declared === undefined) continue;

    const base = collection.base === '' ? [] : [collection.base];
    const add = (level: string | null, segments: Readonly<Record<string, string>>, values: readonly string[]): void => {
      const route = `/${[...base, ...values].join('/')}`;
      const url = urls.url({ locale: entry.locale, route });

      if (!pages.has(url))
        pages.set(
          url,
          Object.freeze({
            collection: entry.collection,
            locale: entry.locale,
            level,
            segments,
            route,
            url,
            page: 1,
            pages: 1,
            first: url,
          }),
        );
    };

    if (declared.root) add(null, Object.freeze({}), []);

    const segments: Record<string, string> = {};
    const values: string[] = [];

    for (const part of collection.grammar) {
      if (part.kind !== 'segment') continue;

      const value = entry.segments[part.name] ?? '';

      segments[part.name] = value;
      values.push(value);

      if (declared.levels.includes(part.name)) add(part.name, Object.freeze({ ...segments }), [...values]);
    }
  }

  const sliced = [...pages.values()].flatMap((folder) => slicesOf(folder, input, urls));

  return Object.freeze(sliced.sort((a, b) => compare(a.url, b.url)));
}

/**
 * A folder's pages: its first one, then one per further slice of its items (entries, or subfolders when a named
 * segment lies below it), by its level's page size.
 */
function slicesOf(folder: FolderPage, input: FolderPagesInput, urls: UrlBuilder): FolderPage[] {
  const collection = input.collections[folder.collection];
  const size = collection?.folderPages?.perPage[folder.level ?? 'root'];

  if (collection === undefined || size === undefined) return [folder];

  const named = collection.grammar.flatMap((part) => (part.kind === 'segment' ? [part.name] : []));
  const next = named[Object.keys(folder.segments).length];
  const inside = input.entries.filter(
    (entry) =>
      !entry.reserved &&
      entry.collection === folder.collection &&
      entry.locale === folder.locale &&
      Object.entries(folder.segments).every(([segment, value]) => entry.segments[segment] === value),
  );
  const items = next === undefined ? inside.length : new Set(inside.map((entry) => entry.segments[next] ?? '')).size;
  const pages = Math.max(1, Math.ceil(items / size));

  return Array.from({ length: pages }, (_, index): FolderPage => {
    const page = index + 1;

    if (page === 1) return Object.freeze({ ...folder, pages });

    const route = `${folder.route === '/' ? '' : folder.route}/page/${String(page)}`;

    return Object.freeze({ ...folder, route, url: urls.url({ locale: folder.locale, route }), page, pages });
  });
}
