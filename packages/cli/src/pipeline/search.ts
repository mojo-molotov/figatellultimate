/**
 * `figatellultimate search`: after the framework's static build, the mounted entries of searchable collections read from
 * the built site and indexed per locale by `@figatellultimate/pagefind`, each with its title and date as sort keys.
 *
 * Invariants (`search-e2e.test.ts`, real Pagefind): only mounted, searchable entries; each page read from the first
 * built folder holding it (a route per base, each writing its own under an adapter); a missing page or one without
 * `data-pagefind-body` content fails, without absolute paths.
 */
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { createUrlBuilder, type FigatellultimateConfig } from '@figatellultimate/core';
import { indexSite, type IndexedSite, type SearchPage } from '@figatellultimate/pagefind';

import { runOnce, type RunResult } from './run.js';

/**
 * What an indexing needs: the config, the built site, where to write the bundles, and how the framework names its
 * pages.
 *
 */
export interface SearchInput {
  readonly config: FigatellultimateConfig;
  /** Absolute project root. */
  readonly directory: string;
  /**
   * The folders of the framework's built HTML (relative to the working directory, or absolute): one per route writing
   * its own (Next under an adapter); each page read from the first holding it.
   */
  readonly sites: readonly string[];
  /** Where to write one Pagefind bundle per locale. */
  readonly out: string;
  /** The build writes every locale in its own folder, the default one included (e.g. next-intl's `app/[locale]`). */
  readonly localeFolders?: boolean | undefined;
  readonly cwd: string;
}

/** Why a mounted entry could not be indexed: the safety net of static generation. */
export interface SearchDiagnostic {
  readonly code: 'missing-built-page' | 'empty-search-content' | 'pagefind-error';
  readonly url: string;
  /** The built file, relative to the working directory (never an absolute path). */
  readonly file: string;
  readonly message?: string | undefined;
}

/**
 * What an indexing found and did: per locale, the pages and words indexed, and every problem.
 *
 */
export interface SearchResult {
  /** The content run: indexing only starts when it has no error. */
  readonly run: RunResult;
  readonly indexed?: IndexedSite['locales'] | undefined;
  readonly diagnostics: readonly SearchDiagnostic[];
  /** Pages skipped because their collection is not searchable. */
  readonly skipped: number;
}

/**
 * `/` → `index.html`, `/en/docs` → `en/docs.html` (a trailing slash dropped): how static builds name pages.
 *
 * @param url - A mounted URL.
 * @returns Its built HTML file, relative to the site's folder.
 */
export function builtFileOf(url: string): string {
  const path = url.replace(/^\/+|\/+$/g, '');

  return path === '' ? 'index.html' : `${path}.html`;
}

/**
 * `figatellultimate search`: the content run of `build` in production (same URL rule), then every mounted entry
 * of a searchable collection is read from the built site and indexed by locale.
 *
 * @param input - The config, the built site, the output, and whether every locale has its own folder.
 * @returns The indexed pages per locale, or the diagnostics: a missing built page, a page without indexable
 *   content.
 */
export async function runSearch(input: SearchInput): Promise<SearchResult> {
  const { config, directory, cwd } = input;
  const run = await runOnce({ config, directory, mode: 'production', write: false });

  if (run.hasErrors) return { run, diagnostics: [], skipped: 0 };

  const urls = createUrlBuilder(config.locales, config.urls);
  const sites = input.sites.map((site) => resolve(cwd, site));
  // Relative to the working directory; on another drive (Windows), only the built file's own name (no leak).
  const shown = (path: string, url: string): string => {
    const rel = relative(cwd, path).replaceAll('\\', '/');

    return isAbsolute(rel) ? builtFileOf(url) : rel;
  };
  const diagnostics: SearchDiagnostic[] = [];
  const pages: SearchPage[] = [];
  const files = new Map<string, string>();
  let skipped = 0;

  for (const { descriptor, data } of run.assembly.entries) {
    if (descriptor.reserved) continue;

    if (config.collections[descriptor.collection]?.searchable === false) {
      skipped += 1;
      continue;
    }

    const url = urls.url(descriptor);
    // Where the framework wrote it: at the public URL, or under its locale's folder (`/about` → `fr/about.html`).
    const built =
      input.localeFolders === true ? builtFileOf(`/${descriptor.locale}${descriptor.route}`) : builtFileOf(url);
    const paths = sites.map((site) => join(site, ...built.split('/')));
    let html: string | undefined;
    let path = paths[0] ?? built;

    for (const candidate of paths) {
      html = await readFile(candidate, 'utf8').catch(() => undefined);

      if (html !== undefined) {
        path = candidate;
        break;
      }
    }

    files.set(url, shown(path, url));

    // Missing from every folder: shown where the first one would hold it.
    if (html === undefined) {
      diagnostics.push({ code: 'missing-built-page', url, file: shown(path, url) });
      continue;
    }

    // The sort keys: the title and publication date its collection declares.
    const fields = config.collections[descriptor.collection]?.metadata ?? {};
    const text = (field: string | undefined): string | undefined => {
      const value = field === undefined ? undefined : data[field];

      return typeof value === 'string' && value !== '' ? value : undefined;
    };
    const title = text(fields.title);
    const date = text(fields.publishedTime);

    pages.push({
      url,
      locale: descriptor.locale,
      collection: descriptor.collection,
      html,
      sort: { ...(title === undefined ? {} : { title }), ...(date === undefined ? {} : { date }) },
    });
  }

  if (diagnostics.length > 0) return { run, diagnostics, skipped };

  const indexed = await indexSite({ pages, outputDirectory: resolve(cwd, input.out) });

  for (const problem of indexed.problems) {
    diagnostics.push({
      code: problem.code,
      url: problem.url,
      file: files.get(problem.url) ?? problem.url,
      message: problem.message,
    });
  }

  return { run, indexed: indexed.locales, diagnostics, skipped };
}
