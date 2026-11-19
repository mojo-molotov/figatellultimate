/**
 * The collection model every generated file of a collection derives from: its type names, query parameters, levels,
 * entries and lookup tree; and the shared helpers (names, literals, code-unit order).
 */
import type { Collection, Entry } from '@figatellultimate/core';

/** Everything the generated files of one collection derive from. */
export interface CollectionModel {
  /** Collection key, e.g. `blog`. */
  readonly name: string;
  readonly collection: Collection;
  /** Generated type name, e.g. `BlogPost` (from `entry: 'blogPost'`). */
  readonly type: string;
  /** Query parameters: `locale`, the named segments, then `slug` (or `path` for free-depth grammars). */
  readonly parameters: readonly string[];
  /** The parameters forming the lookup table levels: all but `locale`. */
  readonly levels: readonly string[];
  /** Kept entries of the collection, by key then locale. */
  readonly entries: readonly Entry[];
}

/**
 * `blogPost` → `BlogPost`.
 *
 * @param name - A camelCase name.
 * @returns The same name, its first letter uppercased.
 */
export const pascal = (name: string): string => `${name.charAt(0).toUpperCase()}${name.slice(1)}`;

/**
 * A TypeScript literal for any serializable value: JSON is a valid JavaScript expression (no string patching).
 *
 * @param value - A JSON-serializable value.
 * @returns Its JSON text.
 */
export const literal = (value: unknown): string => JSON.stringify(value);

/**
 * Code-unit order: generated output never depends on the machine's locale.
 *
 * @param a - A string.
 * @param b - Another string.
 * @returns A negative number, zero or a positive number.
 */
export const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function parameterNames(collection: Collection): string[] {
  const named = collection.grammar.flatMap((part) => (part.kind === 'segment' ? [part.name] : []));
  const isFree = collection.grammar.some((part) => part.kind === 'rest');

  return ['locale', ...named, isFree ? 'path' : 'slug'];
}

/**
 * Values of the query parameters of one entry.
 *
 * @param collection - The collection.
 * @param entry - The entry.
 * @returns Each query parameter's value: `locale`, the named segments, then `slug` or `path`.
 */
export function parameterValues(collection: Collection, entry: Entry): Record<string, string> {
  const { descriptor } = entry;
  const values: Record<string, string> = { locale: descriptor.locale };

  for (const part of collection.grammar) {
    if (part.kind === 'segment') values[part.name] = descriptor.segments[part.name] ?? '';
  }

  const restPart = collection.grammar.find((part) => part.kind === 'rest');

  if (restPart === undefined) {
    values['slug'] = descriptor.slug;
  } else {
    const restValue = descriptor.segments[restPart.name] ?? '';

    values['path'] = [restValue, descriptor.isIndex ? '' : descriptor.slug].filter((v) => v !== '').join('/');
  }

  return values;
}

/**
 * Module path of an entry's data, relative to the collection folder, without extension.
 *
 * @param entry - A kept entry.
 * @returns `entries/<locale>/<key>`, `_root` for the root entry.
 */
export const entryModule = (entry: Entry): string =>
  `entries/${entry.descriptor.locale}/${entry.descriptor.key === '' ? '_root' : entry.descriptor.key}`;

/**
 * Everything the generated files of one collection derive from.
 *
 * @param name - The collection's name.
 * @param collection - Its declaration.
 * @param entries - Its kept entries.
 * @returns Its model, entries sorted by key then locale.
 */
export function collectionModel(name: string, collection: Collection, entries: readonly Entry[]): CollectionModel {
  const parameters = parameterNames(collection);
  const byKeyThenLocale = (a: Entry, b: Entry): number =>
    compareText(`${a.descriptor.key}\u0000${a.descriptor.locale}`, `${b.descriptor.key}\u0000${b.descriptor.locale}`);

  return {
    name,
    collection,
    type: pascal(collection.entry),
    parameters,
    levels: parameters.filter((p) => p !== 'locale'),
    entries: [...entries].sort(byKeyThenLocale),
  };
}

/** A node of the lookup table: a level (value → child), or a leaf (the locales in which the entry exists). */
export type TreeNode =
  | { readonly kind: 'level'; readonly children: ReadonlyMap<string, TreeNode> }
  | { readonly kind: 'leaf'; readonly locales: ReadonlySet<string> };

/** A `TreeNode` while it is built: the same shape, mutable. */
type Building =
  | { readonly kind: 'level'; readonly children: Map<string, Building> }
  | { readonly kind: 'leaf'; readonly locales: ReadonlySet<string> };

/**
 * The nested lookup table of a collection: level values in order, leaves = locales of each entry.
 *
 * @param model - The collection.
 * @returns The table's root.
 */
export function lookupTree(model: CollectionModel): TreeNode {
  const root = new Map<string, Building>();

  for (const entry of model.entries) {
    const values = parameterValues(model.collection, entry);
    let level = root;

    model.levels.forEach((name, depth) => {
      const value = values[name] ?? '';
      const existing = level.get(value);

      if (depth === model.levels.length - 1) {
        const locales = new Set(existing?.kind === 'leaf' ? existing.locales : []);

        locales.add(entry.descriptor.locale);
        level.set(value, { kind: 'leaf', locales });

        return;
      }

      const children = existing?.kind === 'level' ? existing.children : new Map<string, Building>();

      level.set(value, { kind: 'level', children });
      level = children;
    });
  }

  return { kind: 'level', children: root };
}
