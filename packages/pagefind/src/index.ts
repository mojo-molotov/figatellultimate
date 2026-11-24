/**
 * The Pagefind adapter: indexes the built HTML of the mounted entries, one bundle per locale, for `figatellultimate search`.
 *
 * Architecture:
 *     figatellultimate search (CLI) ──> pages { url, locale, collection, html, sort } ──> indexSite
 *         per locale: pagefind.createIndex({ forceLanguage }) ──> addHTMLFile(page + markers) ──> getFiles
 *                     markers: the collection filter, the sort keys (title, newest, oldest), the date metadata
 *                     getFiles ──> each file written here, awaited ──> pagefind.close() once every locale is done
 *
 * Key design decisions:
 *     - figatellultimate gives each page its locale and collection (one rule for URLs): Pagefind would read `<html lang>`,
 *       which a root layout without routing cannot know.
 *     - One bundle per locale, each with its language forced: the client chooses the bundle, so the stemming never
 *       depends on the page the reader searches from.
 *     - Only the mounted entries of searchable collections, only their `data-pagefind-body` element: a clean index,
 *       the app's markup explicit about what is content.
 *     - Markers are hidden, ignored elements added at the end of the body: the collection as a filter, the sort keys
 *       (a title lowercased without accents, the date twice so that undated pages come last both ways), the date as
 *       metadata for the results.
 *     - A page with nothing to index fails the indexing: the safety net of static generation (a page rendered on the
 *       client only would have an empty body).
 *     - The only package importing Pagefind: the search runtime loads the built bundle instead.
 *     - The bundle is written here from Pagefind's in-memory files (`getFiles`), each write awaited. Rejected:
 *       Pagefind's own `writeFiles`, which answers before its last files reach the disk, while `close()` kills its
 *       process at once: the last locale's files were sometimes left empty. Like `writeFiles`, the folder is not
 *       emptied first.
 *
 * Invariants: problems for empty pages, and every bundle complete once `indexSite` returns, repeated against the
 * timing race (`index-site.test.ts`); the written bundles searched as a browser would, per locale, with filters,
 * sorts and dates (`browser-bundle.test.ts`).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import * as pagefind from 'pagefind';

import { withMarkers, type SearchPage } from './markers.js';

export { SORT_KEYS, type SearchPage } from './markers.js';

/** Why a page could not be indexed; the CLI turns it into a diagnostic. */
export interface SearchProblem {
  readonly code: 'empty-search-content' | 'pagefind-error';
  readonly url: string;
  readonly message?: string | undefined;
}

/** What an indexing did: per locale, the pages and words indexed; and every problem. */
export interface IndexedSite {
  /** Per locale: pages and unique words indexed. */
  readonly locales: Readonly<Record<string, { readonly pages: number; readonly words: number }>>;
  readonly problems: readonly SearchProblem[];
}

const BODY = /<([a-zA-Z][\w-]*)\b[^>]*\sdata-pagefind-body(?=[\s=>]|\/>)[^>]*>/;

/**
 * The text Pagefind would index in a built page.
 *
 * @param html - The page's full HTML.
 * @returns The text of its first `data-pagefind-body` element (tags balanced by name, then scripts, styles and tags
 *   removed), `undefined` when it has none. Needed because Pagefind's own word count cannot tell an empty page (it
 *   counts 1).
 *
 * @example
 * indexableText('<main data-pagefind-body><h1>Hi</h1><script>x</script></main>'); // 'Hi'
 */
export function indexableText(html: string): string | undefined {
  const open = BODY.exec(html);

  if (open === null) return undefined;

  const name = (open[1] ?? '').toLowerCase();
  const tag = new RegExp(`<(/?)${name}\\b[^>]*>`, 'gi');

  tag.lastIndex = open.index + open[0].length;
  let depth = 1;
  let end = html.length;

  for (let match = tag.exec(html); match !== null; match = tag.exec(html)) {
    depth += match[1] === '/' ? -1 : 1;

    if (depth === 0) {
      end = match.index;
      break;
    }
  }

  return html
    .slice(open.index + open[0].length, end)
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Writes a bundle's files, each awaited: on disk, complete, before Pagefind is closed.
 *
 * @param directory - The locale's bundle folder.
 * @param files - Pagefind's in-memory files, their paths relative and POSIX.
 * @returns Once every file is written.
 */
async function writeBundle(
  directory: string,
  files: readonly { readonly path: string; readonly content: Uint8Array }[],
): Promise<void> {
  for (const file of files) {
    const path = join(directory, ...file.path.split('/'));

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.content);
  }
}

/**
 * Indexes built pages with Pagefind's Node API.
 *
 * @param input - The pages (URL, locale, collection, HTML, sort keys) and the output folder.
 * @returns Per locale, the pages and unique words indexed, written to `<outputDirectory>/<locale>/` with the
 *   locale's language forced (its stemming); and every problem: a page without a `data-pagefind-body` element or
 *   without indexed words is reported, never silently skipped.
 *
 * @example
 * const { locales, problems } = await indexSite({ pages, outputDirectory: 'public/pagefind' });
 */
export async function indexSite(input: {
  readonly pages: readonly SearchPage[];
  readonly outputDirectory: string;
}): Promise<IndexedSite> {
  const problems: SearchProblem[] = [];
  const locales: Record<string, { pages: number; words: number }> = {};
  const byLocale = new Map<string, SearchPage[]>();

  for (const page of input.pages) byLocale.set(page.locale, [...(byLocale.get(page.locale) ?? []), page]);

  try {
    for (const [locale, pages] of [...byLocale].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const created = await pagefind.createIndex({ forceLanguage: locale });
      const index = created.index;

      if (index === undefined) {
        problems.push({ code: 'pagefind-error', url: '/', message: created.errors.join('; ') });
        continue;
      }

      let count = 0;
      let words = 0;

      for (const page of pages) {
        const text = indexableText(page.html);

        if (text === undefined || !/[\p{L}\p{N}]/u.test(text)) {
          problems.push({ code: 'empty-search-content', url: page.url });
          continue;
        }

        const added = await index.addHTMLFile({ url: page.url, content: withMarkers(page) });

        if (added.errors.length > 0) {
          problems.push({ code: 'pagefind-error', url: page.url, message: added.errors.join('; ') });
        } else {
          count += 1;
          words += added.file.uniqueWords;
        }
      }

      const built = await index.getFiles();

      if (built.errors.length > 0)
        problems.push({ code: 'pagefind-error', url: '/', message: built.errors.join('; ') });
      else await writeBundle(join(input.outputDirectory, locale), built.files);

      await index.deleteIndex();
      locales[locale] = { pages: count, words };
    }
  } finally {
    await pagefind.close();
  }

  return { locales, problems };
}
