/**
 * The structural analysis: every source path parsed, then the checks that need every path at once.
 *
 * Key design decisions:
 *     - Collisions are always errors, naming both files: a URL or a key used twice has no correct implicit
 *       resolution, and a policy would make the result depend on the scan's order.
 *     - Paths and descriptors stay in memory (the global checks need them all, and they are small); heavy documents
 *       stream elsewhere.
 *     - Deterministic: code-unit sorting, no locale-sensitive comparison.
 *
 * Invariants (`analyze.test.ts`): successes never lost; permuted inputs give the same analysis; the URL round trip;
 * collisions and twins reported.
 */
import { matchesReservation, type Collection } from '../declarations/collection.js';
import {
  compareDiagnostics,
  compareText as compare,
  diagnostic,
  type Diagnostic,
  type FileErrorDiagnostic,
  type FolderPageCollisionDiagnostic,
  type ListingIndexCollisionDiagnostic,
} from '../shared/diagnostics.js';
import type { Locales } from '../declarations/locales.js';
import type { EntryDescriptor } from './descriptor.js';
import { parseEntryPath } from './parse.js';
import { suggest } from '../shared/suggest.js';
import { folderPagesOf } from './folders.js';
import { createUrlBuilder, type UrlBuilder } from './url.js';

/** A listed content file: its collection and its path in it. */
export interface SourceInput {
  readonly collection: string;
  /** POSIX path relative to the collection root. Non-`.mdx` paths are ignored. */
  readonly sourcePath: string;
}

/** What `analyze` gives: the valid entries and every diagnostic. */
export interface Analysis {
  /** Every valid entry, even when other sources fail; never an entry involved in an error. */
  readonly entries: readonly EntryDescriptor[];
  /** All diagnostics (errors and warnings), sorted by collection, path and code. */
  readonly diagnostics: readonly Diagnostic[];
}

/** What `analyze` reads: the declarations, the listed files, and the URL strategy. */
export interface AnalyzeInput {
  readonly locales: Locales;
  readonly collections: Readonly<Record<string, Collection>>;
  readonly sources: readonly SourceInput[];
  /** The project's URL strategy, needed to detect URL collisions. Default: `createUrlBuilder(locales)`. */
  readonly urls?: UrlBuilder | undefined;
}

const EXTENSION = '.mdx';

function sameLocales(a: Locales, b: Locales): boolean {
  return (
    a === b || (a.default === b.default && a.list.length === b.list.length && a.list.every((l, i) => b.list[i] === l))
  );
}

const idOf = (source: SourceInput): string => `${source.collection}\u0000${source.sourcePath}`;

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);

    if (group === undefined) groups.set(key, [item]);
    else group.push(item);
  }

  return [...groups.values()];
}

function caseCollisions(sources: readonly SourceInput[]): FileErrorDiagnostic[] {
  return groupBy(sources, (s) => `${s.collection}\u0000${s.sourcePath.toLowerCase()}`)
    .filter((group) => group.length > 1)
    .flatMap((group) =>
      group.map((source) =>
        diagnostic({
          code: 'case-collision',
          severity: 'error',
          collection: source.collection,
          sourcePath: source.sourcePath,
          data: { others: group.filter((o) => o !== source).map((o) => o.sourcePath) },
          suggestions: [],
        }),
      ),
    );
}

/** Same (collection, locale, key): a duplicate default-locale version or a plain key collision. */
function keyCollisions(entries: readonly EntryDescriptor[]): FileErrorDiagnostic[] {
  return groupBy(entries, (e) => `${e.collection}\u0000${e.locale}\u0000${e.key}`)
    .filter((group) => group.length > 1)
    .flatMap((group) =>
      group.map((entry) => {
        const others = group.filter((o) => o !== entry);
        const base = {
          severity: 'error',
          collection: entry.collection,
          sourcePath: entry.sourcePath,
          data: { key: entry.key, locale: entry.locale, others: others.map((o) => o.sourcePath) },
          suggestions: [],
        } as const;

        return others.some((o) => o.localeSource !== entry.localeSource)
          ? diagnostic({ code: 'duplicate-default-locale', ...base })
          : diagnostic({ code: 'key-collision', ...base });
      }),
    );
}

/** Same URL across all collections; pairs already reported as key collisions are skipped. */
function urlCollisions(entries: readonly EntryDescriptor[], urls: UrlBuilder): FileErrorDiagnostic[] {
  const sameEntry = (a: EntryDescriptor, b: EntryDescriptor): boolean =>
    a.collection === b.collection && a.locale === b.locale && a.key === b.key;

  return groupBy(entries, (e) => urls.url(e)).flatMap((group) =>
    group.flatMap((entry) => {
      const others = group.filter((o) => o !== entry && !sameEntry(o, entry));

      if (others.length === 0) return [];

      return [
        diagnostic({
          code: 'url-collision',
          severity: 'error',
          collection: entry.collection,
          sourcePath: entry.sourcePath,
          data: {
            url: urls.url(entry),
            others: others.map((o) => ({ collection: o.collection, sourcePath: o.sourcePath })),
          },
          suggestions: [],
        }),
      ];
    }),
  );
}

/** `foo.mdx` next to a `foo/` folder without `foo/index.mdx` (the "ugly index" warning: renaming a section should mean renaming one folder). */
function uglyIndexes(entries: readonly EntryDescriptor[], sources: readonly SourceInput[]): Diagnostic[] {
  const folders = new Set<string>();
  const paths = new Set(sources.map(idOf));

  for (const { collection, sourcePath } of sources) {
    const parts = sourcePath.split('/');

    for (let depth = 1; depth < parts.length; depth++)
      folders.add(`${collection}\u0000${parts.slice(0, depth).join('/')}`);
  }

  return entries.flatMap((entry) => {
    const folder = entry.sourcePath.slice(0, -EXTENSION.length);
    const index = `${folder}/index${EXTENSION}`;
    const hasFolder = folders.has(`${entry.collection}\u0000${folder}`);

    if (entry.isIndex || !hasFolder || paths.has(idOf({ collection: entry.collection, sourcePath: index }))) return [];

    return [
      diagnostic({
        code: 'ugly-index',
        severity: 'warning',
        collection: entry.collection,
        sourcePath: entry.sourcePath,
        data: { folder },
        suggestions: [index],
      }),
    ];
  });
}

function unusedReservations(
  collections: Readonly<Record<string, Collection>>,
  entries: readonly EntryDescriptor[],
): Diagnostic[] {
  return Object.entries(collections).flatMap(([name, collection]) => {
    const keys = [...new Set(entries.filter((e) => e.collection === name).map((e) => e.key))];

    return collection.reserved
      .filter((pattern) => !keys.some((key) => matchesReservation(key, pattern)))
      .map((pattern) =>
        diagnostic({
          code: 'unused-reservation',
          severity: 'warning',
          collection: name,
          sourcePath: null,
          data: { pattern },
          suggestions: suggest(pattern.replace(/\/\*$/, ''), keys),
        }),
      );
  });
}

/**
 * Folders shown with an image that declare none: each folder with a page of its own, or previewed on its parent's
 * page (the collection's own page for the first level), and no `folderPages.images` entry. The collection's own page
 * has no path to declare an image for: never reported.
 */
function folderImageFallbacks(
  collections: Readonly<Record<string, Collection>>,
  entries: readonly EntryDescriptor[],
): Diagnostic[] {
  return Object.entries(collections).flatMap(([name, collection]) => {
    const pages = collection.folderPages;

    if (pages === null) return [];

    const named = collection.grammar.flatMap((part) => (part.kind === 'segment' ? [part.name] : []));
    const levels: readonly string[] = pages.levels;
    const shown = (depth: number): boolean => {
      const own = named[depth - 1];
      const parent = named[depth - 2];

      return (
        (own !== undefined && levels.includes(own)) ||
        (depth === 1 ? pages.root : parent !== undefined && levels.includes(parent))
      );
    };
    const folders = new Set(
      entries
        .filter((entry) => entry.collection === name)
        .flatMap((entry) => {
          const values = named.map((segment) => entry.segments[segment] ?? '');

          return values.map((_, depth) => values.slice(0, depth + 1).join('/'));
        }),
    );
    const fallback = collection.metadata.image === undefined ? 'none' : 'newest-entry';

    return (
      [...folders]
        // Its own key only: `in` would find `Object.prototype`'s for a folder named `constructor`.
        .filter((path) => !Object.hasOwn(pages.images, path) && shown(path.split('/').length))
        .sort(compare)
        .map((path) =>
          diagnostic({
            code: 'folder-image-fallback',
            severity: 'info',
            collection: name,
            sourcePath: null,
            data: { path, fallback },
            suggestions: [],
          }),
        )
    );
  });
}

/** Folder images declared for a folder no entry is in: a typo, or a folder renamed. */
function unusedFolderImages(
  collections: Readonly<Record<string, Collection>>,
  entries: readonly EntryDescriptor[],
): Diagnostic[] {
  return Object.entries(collections).flatMap(([name, collection]) => {
    const declared = Object.keys(collection.folderPages?.images ?? {});

    if (declared.length === 0) return [];

    const named = collection.grammar.flatMap((part) => (part.kind === 'segment' ? [part.name] : []));
    // Every folder path the content has: each prefix of an entry's named segment values.
    const folders = new Set(
      entries
        .filter((entry) => entry.collection === name)
        .flatMap((entry) => {
          const values = named.map((segment) => entry.segments[segment] ?? '');

          return values.map((_, depth) => values.slice(0, depth + 1).join('/'));
        }),
    );

    return declared
      .filter((path) => !folders.has(path))
      .map((path) =>
        diagnostic({
          code: 'unused-folder-image',
          severity: 'warning',
          collection: name,
          sourcePath: null,
          data: { path },
          suggestions: suggest(path, [...folders]),
        }),
      );
  });
}

function compareEntries(a: EntryDescriptor, b: EntryDescriptor): number {
  return (
    compare(a.collection, b.collection) ||
    compare(a.key, b.key) ||
    compare(a.locale, b.locale) ||
    compare(a.sourcePath, b.sourcePath)
  );
}

/**
 * Analyzes every source path of the content.
 *
 * @param input - The locales, the collections, the source paths (collection and collection-relative path), and the
 *   URL strategy (default: `createUrlBuilder(locales)`).
 * @returns Every valid entry descriptor and every diagnostic: each path's, then the global checks (URL and key
 *   collisions across collections, an implicit and explicit twin of a default-locale entry, case collisions, ugly
 *   index, unused reservations). A failing source never removes another valid entry. Sorted and frozen, whatever
 *   the input's order.
 * @throws {TypeError} When a source names an undeclared collection: a broken caller contract.
 *
 * @example
 * const { entries, diagnostics } = analyze({ locales, collections: { blog }, sources: [{ collection: 'blog', sourcePath: 'news/a.mdx' }] });
 */
export function analyze(input: AnalyzeInput): Analysis {
  const { locales, collections } = input;
  const urls = input.urls ?? createUrlBuilder(locales);

  if (!sameLocales(urls.locales, locales)) {
    throw new TypeError('analyze: the URL builder was created with other locales than the ones given to analyze.');
  }

  const unique = new Map(
    input.sources.filter((s) => s.sourcePath.endsWith(EXTENSION)).map((s) => [idOf(s), s] as const),
  );
  const sources = [...unique.values()];

  const diagnostics: Diagnostic[] = [];
  const parsed: EntryDescriptor[] = [];

  for (const source of sources) {
    const collection = collections[source.collection];

    if (collection === undefined) {
      throw new TypeError(
        `analyze: source "${source.sourcePath}" names an undeclared collection "${source.collection}".`,
      );
    }

    const result = parseEntryPath(source.collection, collection, locales, source.sourcePath);

    diagnostics.push(...result.warnings);

    if (result.ok) parsed.push(result.value);
    else diagnostics.push(...result.errors);
  }

  const globalErrors = [
    ...caseCollisions(sources),
    ...keyCollisions(parsed),
    // An unmounted collection's entries have no page: they never take a URL.
    ...urlCollisions(
      parsed.filter((entry) => collections[entry.collection]?.mounted !== false),
      urls,
    ),
    ...folderPageCollisions(parsed, locales, collections, urls),
    ...listingIndexCollisions(parsed, locales, collections, urls),
  ];
  const failed = new Set(globalErrors.map((d) => idOf({ collection: d.collection, sourcePath: d.sourcePath })));
  const entries = parsed.filter((entry) => !failed.has(idOf(entry)));

  diagnostics.push(
    ...globalErrors,
    ...uglyIndexes(entries, sources),
    ...unusedReservations(collections, parsed),
    ...unusedFolderImages(collections, parsed),
    ...folderImageFallbacks(collections, parsed),
  );

  return Object.freeze({
    entries: Object.freeze(entries.sort(compareEntries)),
    diagnostics: Object.freeze(diagnostics.sort(compareDiagnostics)),
  });
}

/**
 * Whether an analysis holds at least one error (warnings aside).
 *
 * @param analysis - An analysis.
 * @returns `true` with an error: the CLI's exit code, the code generator's guard.
 *
 * @example
 * if (hasErrors(analysis)) return EXIT.content;
 */
export function hasErrors(analysis: Analysis): boolean {
  return analysis.diagnostics.some((d) => d.severity === 'error');
}

/**
 * Entries of a listing whose index is a folder's batch (`<batches>/pages/<n>`, any page a batch could start at): two
 * files at one URL. Only a listing two levels below the folder can, its folders named `pages` and a page's number.
 */
function listingIndexCollisions(
  entries: readonly EntryDescriptor[],
  locales: Locales,
  collections: Readonly<Record<string, Collection>>,
  urls: UrlBuilder,
): ListingIndexCollisionDiagnostic[] {
  const folders = folderPagesOf({ locales, collections, urls, entries }).filter((folder) => folder.page === 1);
  const batches = new Map(
    folders.flatMap((folder) =>
      folder.batches === undefined
        ? []
        : Array.from({ length: folder.pages }, (_, n) => [
            `${folder.batches ?? ''}/pages/${String(n + 1)}`,
            folder.url,
          ]),
    ),
  );

  return folders.flatMap((listing) => {
    const other = listing.index === undefined ? undefined : batches.get(listing.index);

    return other === undefined || listing.index === undefined
      ? []
      : entries
          .filter(
            (entry) =>
              !entry.reserved &&
              entry.collection === listing.collection &&
              entry.locale === listing.locale &&
              Object.entries(listing.segments).every(([segment, value]) => entry.segments[segment] === value),
          )
          .map((entry) =>
            diagnostic({
              code: 'listing-index-collision',
              severity: 'error',
              collection: entry.collection,
              sourcePath: entry.sourcePath,
              data: { url: listing.index ?? '', folder: other },
              suggestions: [],
            }),
          );
  });
}

/** Entries whose URL is a folder page's: two pages at one URL, never resolved implicitly. */
function folderPageCollisions(
  entries: readonly EntryDescriptor[],
  locales: Locales,
  collections: Readonly<Record<string, Collection>>,
  urls: UrlBuilder,
): FolderPageCollisionDiagnostic[] {
  const folders = new Map(folderPagesOf({ locales, collections, urls, entries }).map((f) => [f.url, f]));

  return entries.flatMap((entry): FolderPageCollisionDiagnostic[] => {
    const folder = folders.get(urls.url(entry));

    return folder === undefined || entry.reserved
      ? []
      : [
          diagnostic({
            code: 'folder-page-collision',
            severity: 'error',
            collection: entry.collection,
            sourcePath: entry.sourcePath,
            data: { url: folder.url, level: folder.level },
            suggestions: [],
          }),
        ];
  });
}
