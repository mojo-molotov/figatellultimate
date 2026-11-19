/**
 * The navigation trees, pure: per locale, the declared collections' entries at the levels their depth reaches,
 * grouped in sections labelled by content message keys.
 */
import {
  createUrlBuilder,
  type Collection,
  type Entry,
  type FolderPage,
  type Locales,
  type NavigationItem,
  type UrlOptions,
} from '@figatellultimate/core';

import { compareText } from './model.js';

/** A node of the generated navigation: an entry link, or a section (a folder, or a labelled collection). */
export type NavigationNode =
  | { readonly kind: 'entry'; readonly url: string; readonly title: string; readonly key: string }
  | {
      readonly kind: 'section';
      /** A message key: `content.<collection>.<…folders>.$.title`, or the collection's declared `label`. */
      readonly label: string;
      readonly url?: string | undefined;
      /** `false` when its collection declares `menus: false`: the navbar links it instead of a menu. */
      readonly menu?: false;
      readonly children: readonly NavigationNode[];
    };

/**
 * What the navigation is built from: the config's declaration, the locales, the kept entries and the folder pages.
 *
 */
export interface NavigationInput {
  readonly locales: Locales;
  readonly collections: Readonly<Record<string, Collection>>;
  readonly urls?: UrlOptions | undefined;
  readonly navigation: readonly NavigationItem[];
  /** The kept entries of the build (drafts and test content follow the environment). */
  readonly entries: readonly Entry[];
  /** The folder pages of the build: a section links its folder page when it has one. */
  readonly folders?: readonly FolderPage[] | undefined;
}

/** The folder values of an entry, in grammar order (a rest segment gives its folders), the locale left out. */
function foldersOf(collection: Collection, entry: Entry): string[] {
  return collection.grammar.flatMap((part) => {
    if (part.kind === 'segment') return [entry.descriptor.segments[part.name] ?? ''];

    if (part.kind !== 'rest') return [];

    return (entry.descriptor.segments[part.name] ?? '').split('/').filter((folder) => folder !== '');
  });
}

interface Folder {
  readonly folders: readonly string[];
  index?: Entry;
  readonly entries: Entry[];
  readonly children: Map<string, Folder>;
}

const folder = (folders: readonly string[]): Folder => ({ folders, entries: [], children: new Map() });

/**
 * The navigation of every locale: for each declared collection in order, the entries of that locale
 * (reserved ones left out) at the levels the depth reaches, and one section per folder holding any of them,
 * labelled by its content message. Siblings by their declared order (`metadata.order`, lower first, the unordered
 * after), then by title; sections by their own page's order, then by folder name. Pure and deterministic.
 *
 * @param input - The navigation declaration, the locales, the entries and the folder pages.
 * @returns One tree per locale; a section links its folder page when it has one.
 */
export function navigationTrees(input: NavigationInput): Readonly<Record<string, readonly NavigationNode[]>> {
  const urls = createUrlBuilder(input.locales, input.urls);
  const result: Record<string, readonly NavigationNode[]> = {};

  for (const locale of input.locales.list) {
    const nodes: NavigationNode[] = [];

    for (const item of input.navigation) {
      const collection = input.collections[item.collection];

      if (collection === undefined) continue;

      const titleField = collection.metadata.title;
      const title = (entry: Entry): string => {
        const value = titleField === undefined ? undefined : entry.data[titleField];

        return typeof value === 'string' && value !== '' ? value : entry.descriptor.slug;
      };
      const orderField = collection.metadata.order;
      // The declared order, lower first; an entry without one after every ordered one.
      const orderOf = (entry: Entry | undefined): number => {
        const value = entry === undefined || orderField === undefined ? undefined : entry.data[orderField];

        return typeof value === 'number' ? value : Number.POSITIVE_INFINITY;
      };
      const byOrder = (a: Entry | undefined, b: Entry | undefined): number => {
        const left = orderOf(a);
        const right = orderOf(b);

        return left === right ? 0 : left < right ? -1 : 1;
      };
      const routeOf = (folders: readonly string[]): string =>
        `/${[...(collection.base === '' ? [] : [collection.base]), ...folders].join('/')}`;
      // A folder's page, by its route in this locale.
      const pages = new Map(
        (input.folders ?? [])
          .filter((page) => page.collection === item.collection && page.locale === locale)
          .map((page) => [page.route, page.url]),
      );
      const root = folder([]);

      for (const entry of input.entries) {
        const { descriptor } = entry;

        if (descriptor.collection !== item.collection || descriptor.locale !== locale || descriptor.reserved) continue;

        const folders = foldersOf(collection, entry);
        const reach = Math.min(folders.length, item.depth);
        let node = root;

        for (let level = 0; level < reach; level++) {
          const value = folders[level] ?? '';
          const child = node.children.get(value) ?? folder(folders.slice(0, level + 1));

          node.children.set(value, child);
          node = child;
        }

        // Deeper than the depth: the entry only makes its folders appear.
        if (folders.length > item.depth) continue;

        if (descriptor.isIndex && folders.length > 0) node.index = entry;
        // A folder with a page of its own is the link: its entries are reached through it.
        else if (folders.length === 0 || !pages.has(routeOf(folders))) node.entries.push(entry);
      }

      const menu = item.menus === false ? ({ menu: false } as const) : {};
      const labelOf = (folders: readonly string[]): string =>
        ['content', item.collection, ...folders, '$', 'title'].join('.');
      const render = (node: Folder): NavigationNode[] => {
        const entries = [...node.entries]
          .sort((a, b) =>
            a.descriptor.isIndex !== b.descriptor.isIndex
              ? a.descriptor.isIndex
                ? -1
                : 1
              : byOrder(a, b) || title(a).localeCompare(title(b), locale),
          )
          .map((entry): NavigationNode =>
            Object.freeze({
              kind: 'entry',
              url: urls.url(entry.descriptor),
              title: title(entry),
              key: entry.descriptor.key,
            }),
          );
        // Sections by their own page's order, then by folder name.
        const sections = [...node.children.keys()]
          .sort((a, b) => byOrder(node.children.get(a)?.index, node.children.get(b)?.index) || compareText(a, b))
          .map((value): NavigationNode => {
            const child = node.children.get(value) ?? folder([]);
            const url =
              child.index === undefined ? pages.get(routeOf(child.folders)) : urls.url(child.index.descriptor);

            return Object.freeze({
              kind: 'section',
              label: labelOf(child.folders),
              ...(url === undefined ? {} : { url }),
              ...menu,
              children: Object.freeze(render(child)),
            });
          });

        return [...entries, ...sections];
      };
      const items = render(root);

      if (item.label === undefined) nodes.push(...items);
      else if (items.length > 0) {
        const url = pages.get(routeOf([]));

        nodes.push(
          Object.freeze({
            kind: 'section',
            label: item.label,
            ...(url === undefined ? {} : { url }),
            ...menu,
            children: Object.freeze(items),
          }),
        );
      }
    }

    result[locale] = Object.freeze(nodes);
  }

  return Object.freeze(result);
}
