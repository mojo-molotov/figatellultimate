/**
 * Folder pages' data, pure: each folder's subfolders (entry count, latest entries by date, image, message keys),
 * direct entries and translations, once per folder; its further pages (`…/page/N`, by its level's page size) listed
 * with their own URLs and translations, the app slicing the folder's items for each.
 */
import type { Collection, Entry, FolderPage } from '@figatellultimate/core';

import { compareText } from './model.js';

/** A subfolder of a folder page: entries by URL, resolved from the light index at runtime. */
interface SubfolderData {
  readonly segments: Readonly<Record<string, string>>;
  /** The subfolder's segment name: whether its page lists folders or entries is the app's to tell. */
  readonly level: string;
  readonly label: string;
  /** The message key of each field its level declares (`messages`), e.g. its `description`. */
  readonly messages: Readonly<Record<string, string>>;
  readonly url?: string;
  /** Declared for its path, else its newest entry's image. */
  readonly image?: string;
  readonly total: number;
  /** Newest first by the collection's date field, at most `preview`. */
  readonly latest: readonly string[];
}

/** The data of one folder page, entries by URL. */
export interface FolderData {
  readonly url: string;
  readonly locale: string;
  readonly segments: Readonly<Record<string, string>>;
  readonly level: string | null;
  readonly label: string | null;
  /** The message key of each field its level declares; none for the collection's own page. */
  readonly messages: Readonly<Record<string, string>>;
  /** Its SEO (`folderPages.metadata`): the message key of its description; none for the collection's own page. */
  readonly metadata: { readonly description?: string };
  /** Declared for its path, else its newest entry's image. */
  readonly image?: string;
  readonly alternates: Readonly<Record<string, string>>;
  readonly subfolders: readonly SubfolderData[];
  readonly entries: readonly string[];
  /** How many pages the folder has (1 without a page size). */
  readonly pages: number;
  /** Its level's page size, when it has one. */
  readonly perPage?: number;
  /** Its pages after the first: each one's URL, number and translations (a locale may have fewer pages). */
  readonly slices: readonly {
    readonly url: string;
    readonly page: number;
    readonly alternates: Readonly<Record<string, string>>;
  }[];
}

/** The content message key of a folder's field: `content.<collection>.<…values>.$.<field>`. */
const keyOf = (collection: string, values: readonly string[], field: string): string =>
  ['content', collection, ...values, '$', field].join('.');

/** The content message key of a folder's title. */
const labelOf = (collection: string, values: readonly string[]): string => keyOf(collection, values, 'title');

/**
 * Every folder page's data of one collection: its subfolders (the next named segment), each with its
 * entry count, its latest entries by date and its own page when its level has one; its direct entries when no named
 * segment lies below it; its translations. Pure and deterministic.
 *
 * @param name - The collection's name.
 * @param collection - Its declaration (folder pages, messages, date and image fields).
 * @param entries - Its kept entries.
 * @param folders - Its folder pages (core's `folderPagesOf`).
 * @param url - An entry's URL.
 * @returns One record per folder page, in the folders' order.
 */
export function folderData(
  name: string,
  collection: Collection,
  entries: readonly Entry[],
  folders: readonly FolderPage[],
  url: (entry: Entry) => string,
): readonly FolderData[] {
  const declared = collection.folderPages;

  if (declared === null) return [];

  const images = declared.images;
  // Each declared field of a level, as the folder's message keys.
  const fields: Readonly<Record<string, readonly string[] | undefined>> = collection.messages;
  const messagesOf = (level: string | null, values: readonly string[]): Record<string, string> =>
    level === null ? {} : Object.fromEntries((fields[level] ?? []).map((field) => [field, keyOf(name, values, field)]));
  const all = folders.filter((folder) => folder.collection === name);
  // A folder's data once, at its first page; its further pages are slices of it.
  const mine = all.filter((folder) => folder.page === 1);
  const named = collection.grammar.flatMap((part) => (part.kind === 'segment' ? [part.name] : []));
  const dateField = collection.metadata.publishedTime;
  const dateOf = (entry: Entry): string => {
    const value = dateField === undefined ? undefined : entry.data[dateField];

    return typeof value === 'string' ? value : '';
  };
  // Newest first; without a date field (or equal dates), the content's order (by key).
  const newestFirst = (a: Entry, b: Entry): number =>
    compareText(dateOf(b), dateOf(a)) || compareText(a.descriptor.key, b.descriptor.key);
  const byRoute = new Map(mine.map((folder) => [`${folder.locale}\u0000${folder.route}`, folder]));
  // A folder's image: declared for its path, else its newest entry's (the collection's image field).
  const imageField = collection.metadata.image;
  const imageOf = (path: readonly string[], folderEntries: readonly Entry[]): { image?: string } => {
    const chosen = path.length === 0 ? undefined : images[path.join('/')];

    if (chosen !== undefined) return { image: chosen };

    for (const entry of [...folderEntries].sort(newestFirst)) {
      const value = imageField === undefined ? undefined : entry.data[imageField];

      if (typeof value === 'string' && value !== '') return { image: value };
    }

    return {};
  };

  return mine.map((folder): FolderData => {
    const values = named.flatMap((segment) => (segment in folder.segments ? [folder.segments[segment] ?? ''] : []));
    const inside = entries.filter(
      (entry) =>
        entry.descriptor.locale === folder.locale &&
        !entry.descriptor.reserved &&
        Object.entries(folder.segments).every(([segment, value]) => entry.descriptor.segments[segment] === value),
    );
    const next = named[values.length];
    const groups = new Map<string, Entry[]>();

    if (next !== undefined) {
      for (const entry of inside) {
        const value = entry.descriptor.segments[next] ?? '';

        groups.set(value, [...(groups.get(value) ?? []), entry]);
      }
    }

    const subfolders = [...groups.keys()].sort(compareText).flatMap((value): SubfolderData[] => {
      const group = [...(groups.get(value) ?? [])].sort(newestFirst);
      const route = `${folder.route === '/' ? '' : folder.route}/${value}`;
      const page = byRoute.get(`${folder.locale}\u0000${route}`);

      // Groups only exist below a named segment.
      if (next === undefined) return [];

      return [
        {
          segments: { ...folder.segments, [next]: value },
          level: next,
          label: labelOf(name, [...values, value]),
          messages: messagesOf(next, [...values, value]),
          ...(page === undefined ? {} : { url: page.url }),
          ...imageOf([...values, value], group),
          total: group.length,
          latest: group.slice(0, declared.preview).map(url),
        },
      ];
    });
    const alternates = Object.fromEntries(
      mine.filter((other) => other.route === folder.route).map((other) => [other.locale, other.url]),
    );
    const perPage = declared.perPage[folder.level ?? 'root'];
    const slices = all
      .filter((slice) => slice.first === folder.url && slice.page > 1)
      .map((slice) => ({
        url: slice.url,
        page: slice.page,
        alternates: Object.fromEntries(
          all.filter((other) => other.route === slice.route).map((other) => [other.locale, other.url]),
        ),
      }));

    return {
      url: folder.url,
      locale: folder.locale,
      segments: folder.segments,
      level: folder.level,
      label: folder.level === null ? null : labelOf(name, values),
      messages: messagesOf(folder.level, values),
      metadata:
        folder.level === null || declared.metadata.description === undefined
          ? {}
          : { description: keyOf(name, values, declared.metadata.description) },
      ...imageOf(values, inside),
      alternates,
      subfolders,
      entries: next === undefined ? [...inside].sort(newestFirst).map(url) : [],
      pages: folder.pages,
      ...(perPage === undefined ? {} : { perPage }),
      slices,
    };
  });
}
