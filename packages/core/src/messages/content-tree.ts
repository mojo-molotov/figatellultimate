/**
 * The content namespace of the messages: the keys every locale must have because of the content.
 *
 * Key design decision: adding a folder or a term adds required keys to every locale, so its typecheck breaks until
 * it is translated; a flat namespace would let two folders share a key.
 *
 * Invariant (`content-tree.test.ts`): two values never share a key.
 */
import type { Collection } from '../declarations/collection.js';
import type { Taxonomy } from '../declarations/taxonomy.js';
import type { EntryDescriptor } from '../paths/descriptor.js';
import { compareText } from '../shared/diagnostics.js';

/** A level of the content namespace: its own required fields (under `$`) and its children by value. */
export interface MessageNode {
  readonly fields: readonly string[];
  readonly children: Readonly<Record<string, MessageNode>>;
}

/** Every message key the content requires in every locale. */
export interface MessageTree {
  /** One root node per collection declaring `messages`. */
  readonly content: Readonly<Record<string, MessageNode>>;
  /** Per taxonomy declaring `messages`: the fields of each term. */
  readonly taxonomies: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
}

interface MutableNode {
  readonly fields: readonly string[];
  readonly children: Map<string, MutableNode>;
}

const freeze = (node: MutableNode): MessageNode =>
  Object.freeze({
    fields: node.fields,
    children: Object.freeze(
      Object.fromEntries(
        [...node.children.entries()]
          .sort(([a], [b]) => compareText(a, b))
          .map(([value, child]) => [value, freeze(child)]),
      ),
    ),
  });

/** The levels of one entry: each value of each named segment, in grammar order (a rest segment gives its folders). */
function levelsOf(collection: Collection, entry: EntryDescriptor): { segment: string; value: string }[] {
  return collection.grammar.flatMap((part) => {
    if (part.kind === 'segment') return [{ segment: part.name, value: entry.segments[part.name] ?? '' }];

    if (part.kind !== 'rest') return [];

    const value = entry.segments[part.name] ?? '';

    return value === '' ? [] : value.split('/').map((folder) => ({ segment: part.name, value: folder }));
  });
}

/** How many segments the namespace spans: up to the last one declaring fields (a rest segment counts once). */
function depthOf(collection: Collection): number {
  const named = collection.grammar.flatMap((part) => (part.kind === 'segment' || part.kind === 'rest' ? [part] : []));
  const messages: Readonly<Record<string, readonly string[] | undefined>> = collection.messages;
  let last = -1;

  named.forEach((part, index) => {
    if (messages[part.name] !== undefined) last = index;
  });

  return last === -1 ? 0 : last + 1;
}

/**
 * The message keys the content requires in every locale.
 *
 * @param input - The collections (their required fields per segment), the taxonomies (per term), and every
 *   structurally valid entry, drafts and test content included: message files are the same in every mode.
 * @returns The tree: `content.<collection>.<value>…` with a node's own fields under `$`, and
 *   `taxonomies.<taxonomy>.<term>`; hierarchical, so two values never share a key. Deterministic, frozen.
 *
 * @example
 * contentMessageTree({ collections, taxonomies, entries: assembly.structure });
 * // content.blog['release-notes'].$.title, content.blog['release-notes'].core.$.title, taxonomies.tags.guide.label…
 */
export function contentMessageTree(input: {
  readonly collections: Readonly<Record<string, Collection>>;
  readonly taxonomies: Readonly<Record<string, Taxonomy>>;
  readonly entries: readonly EntryDescriptor[];
}): MessageTree {
  const content: Record<string, MessageNode> = {};

  for (const name of Object.keys(input.collections).sort(compareText)) {
    const collection = input.collections[name];

    if (collection === undefined) continue;

    const depth = depthOf(collection);

    if (depth === 0) continue;

    const messages: Readonly<Record<string, readonly string[] | undefined>> = collection.messages;
    const root: MutableNode = { fields: [], children: new Map() };

    for (const entry of input.entries.filter((e) => e.collection === name)) {
      let node = root;
      // A named segment counts as one level; a rest segment's folders all belong to its single level.
      let segmentIndex = 0;
      let previous: string | undefined;

      for (const { segment, value } of levelsOf(collection, entry)) {
        if (segment !== previous) segmentIndex += 1;

        previous = segment;

        if (segmentIndex > depth) break;

        let child = node.children.get(value);

        if (child === undefined) {
          child = { fields: Object.freeze([...(messages[segment] ?? [])]), children: new Map() };
          node.children.set(value, child);
        }

        node = child;
      }
    }

    content[name] = freeze(root);
  }

  const taxonomies: Record<string, Readonly<Record<string, readonly string[]>>> = {};

  for (const name of Object.keys(input.taxonomies).sort(compareText)) {
    const taxonomy = input.taxonomies[name];

    if (taxonomy === undefined || taxonomy.messages.length === 0) continue;

    taxonomies[name] = Object.freeze(
      Object.fromEntries([...taxonomy.terms].sort(compareText).map((term) => [term, taxonomy.messages])),
    );
  }

  return Object.freeze({ content: Object.freeze(content), taxonomies: Object.freeze(taxonomies) });
}
