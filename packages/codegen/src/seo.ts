/**
 * Each mounted page's date and indexing: an entry's modification date, else its publication date, and whether its
 * robots allow indexing; a folder or term page dated by its newest indexed entry. `noindex` pages stay mounted but
 * leave the sitemap, the feeds and the search.
 */
import type { Entry, FigatellultimateConfig, FolderPage } from '@figatellultimate/core';

import type { TermData } from './files/terms.js';
import { compareText } from './model.js';

/** A mounted page's date and indexing. */
export interface PageSeo {
  /** Its modification date, else its publication date; a folder or term page's newest indexed entry's. */
  readonly modified?: string;
  /** `false` for an entry whose robots directives forbid indexing: still mounted, never listed for crawlers. */
  readonly indexed: boolean;
}

const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

/** Whether robots directives forbid indexing (`noindex`, or `none`, which also means `nofollow`). */
const forbidsIndexing = (robots: unknown): boolean =>
  typeof robots === 'string' &&
  robots.split(',').some((directive) => ['noindex', 'none'].includes(directive.trim().toLowerCase()));

const newest = (dates: readonly (string | undefined)[]): string | undefined =>
  dates.reduce<string | undefined>(
    (latest, date) => (date === undefined || (latest !== undefined && compareText(latest, date) >= 0) ? latest : date),
    undefined,
  );

/**
 * Every mounted page's date and indexing, by URL: entries from their declared fields; folder and
 * term pages from the indexed entries they list. Pure; an entry without anything to say is absent (indexed, undated).
 *
 * @param config - The config: metadata fields.
 * @param entries - The kept entries.
 * @param folders - The folder pages.
 * @param terms - The term pages' data.
 * @param url - An entry's URL.
 * @returns By URL, the pages with a date or not indexed.
 */
export function pageSeo(
  config: FigatellultimateConfig,
  entries: readonly Entry[],
  folders: readonly FolderPage[],
  terms: readonly TermData[],
  url: (entry: Entry) => string,
): ReadonlyMap<string, PageSeo> {
  const byUrl = new Map<string, PageSeo>();
  const indexed: { readonly entry: Entry; readonly modified: string | undefined }[] = [];

  for (const entry of entries) {
    const fields = config.collections[entry.descriptor.collection]?.metadata ?? {};
    const read = (field: string | undefined): unknown => (field === undefined ? undefined : entry.data[field]);
    const modified = text(read(fields.modifiedTime)) ?? text(read(fields.publishedTime));
    const seo = { ...(modified === undefined ? {} : { modified }), indexed: !forbidsIndexing(read(fields.robots)) };

    byUrl.set(url(entry), seo);

    if (seo.indexed) indexed.push({ entry, modified });
  }

  const pages = new Map<string, PageSeo>();

  for (const [key, seo] of byUrl) if (seo.modified !== undefined || !seo.indexed) pages.set(key, seo);

  for (const folder of folders) {
    const inside = indexed.filter(
      ({ entry }) =>
        entry.descriptor.collection === folder.collection &&
        entry.descriptor.locale === folder.locale &&
        Object.entries(folder.segments).every(([name, value]) => entry.descriptor.segments[name] === value),
    );
    const modified = newest(inside.map((item) => item.modified));

    if (modified !== undefined) pages.set(folder.url, { modified, indexed: true });
  }

  for (const term of terms) {
    const modified = newest(
      term.entries.map((entry) => byUrl.get(entry.url)).flatMap((seo) => (seo?.indexed === true ? [seo.modified] : [])),
    );

    if (modified === undefined) continue;

    // Its further pages list the same entries: the same date.
    for (const page of [term.url, ...term.slices.map((slice) => slice.url)])
      pages.set(page, { modified, indexed: true });
  }

  return pages;
}
