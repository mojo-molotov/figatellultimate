/**
 * Collections: what a set of entries declares, as validated, frozen data.
 *
 * Key design decisions:
 *     - Configuration, never code: a collection declares its grammar and options; the library has no code per
 *       collection, and the generator names the API after it (`entry: 'blogPost'` → `getBlogPost`).
 *     - `index.mdx` yields the folder URL in every collection; positions where it is forbidden are declared.
 *     - Reservations exclude entries from automatic mounting (a dedicated page serves them), still typed and
 *       accessible.
 *     - An unmounted collection (`mounted: false`) has no page at all: its entries are read through their getters
 *       only, e.g. a taxonomy's content (an author's long bio); nothing of it is in the URLs, the sitemap or the search.
 *     - Metadata fields are named, never hard-coded: the site's metadata, sitemap, structured data and feeds read
 *       them.
 *     - Folder pages are declared per level, with an optional image per folder path.
 *
 * Invariants (`collection.test.ts`, `collection.test-d.ts`): every invalid declaration throws; segment names
 * inferred.
 */
import type { GrammarPart, RouteNames, RoutePart, SegmentNames } from './grammar.js';
import { isValidName } from '../shared/names.js';

/** Thrown by `defineCollection` on an invalid declaration (invalid configuration is the only case where core throws). */
export class InvalidCollectionError extends Error {
  override readonly name = 'InvalidCollectionError';
}

/** The schema.org types of a collection's entries. */
export const SCHEMA_TYPES = ['WebPage', 'Article', 'BlogPosting', 'TechArticle', 'NewsArticle'] as const;
/** A schema.org type of a collection's entries, for their structured data. */
export type SchemaType = (typeof SCHEMA_TYPES)[number];

/**
 * Frontmatter fields the site metadata read, by name: data, never code. `type` is the collection's Open Graph
 * type (default `'website'`), `schema` its schema.org type (default `'WebPage'`).
 */
export interface MetadataFields {
  readonly title?: string;
  readonly description?: string;
  readonly image?: string;
  readonly publishedTime?: string;
  /** A modification date, else the publication date: the sitemap's `lastmod`, `dateModified`. */
  readonly modifiedTime?: string;
  readonly tags?: string;
  /** Robots directives, e.g. `'noindex'`: a `noindex` entry leaves the sitemap, the feeds and the search. */
  readonly robots?: string;
  /** An absolute URL replacing the computed canonical. */
  readonly canonical?: string;
  /**
   * A number placing an entry among its siblings in the navigation, the section's list of pages and the previous and
   * next links: lower first; entries without one after, by title.
   */
  readonly order?: string;
  readonly type?: 'website' | 'article';
  readonly schema?: SchemaType;
}

const METADATA_FIELDS: readonly string[] = [
  'title',
  'description',
  'image',
  'publishedTime',
  'modifiedTime',
  'tags',
  'robots',
  'canonical',
  'order',
];

/** What `defineCollection` accepts: the entry name, the URL base, the path grammar, and the optional fields. */
export interface CollectionInput<E extends string, G extends readonly GrammarPart[]> {
  /** Singular entry name, used for generated names: `'page'` → `getPage`, `Page`. camelCase. */
  readonly entry: E;
  /** Static URL prefix of the collection, e.g. `'blog'`, `'lp'`; `''` for none. */
  readonly base: string;
  readonly grammar: G;
  /** Route composition. Default: the segments in grammar order, then the slug. */
  readonly route?: readonly RoutePart<RouteNames<G>>[];
  /** Segments directly under which `index.mdx` is forbidden. */
  readonly indexForbiddenUnder?: readonly SegmentNames<G>[];
  /** Whether `index.mdx` is forbidden directly at the collection root. Default: `false`. */
  readonly indexForbiddenAtRoot?: boolean;
  /** Keys (`'lp/sign-up'`) or key prefixes (`'lp/*'`, descendants only) excluded from automatic mounting. */
  readonly reserved?: readonly string[];
  /** Max length of every segment and slug. Default: 80. */
  readonly maxNameLength?: number;
  /** Frontmatter fields referencing a taxonomy, by taxonomy name, checked after the join. */
  readonly references?: Readonly<Record<string, string>>;
  /** Boolean frontmatter field marking drafts; `null` or absent for none. */
  readonly draft?: string | null;
  /** Keys or key prefixes (`'x/*'`) of test-only content, excluded by the environment. */
  readonly testOnly?: readonly string[];
  /** Fields every value of a segment must have in every locale's messages, per segment name. */
  readonly messages?: { readonly [K in SegmentNames<G>]?: readonly string[] };
  /** Frontmatter fields read by the site metadata. */
  readonly metadata?: MetadataFields;
  /** Whether the local search indexes this collection. Default: `true`. */
  readonly searchable?: boolean;
  /**
   * Whether its entries have pages. `false`: none, every entry read through its getters only (e.g. a taxonomy's
   * `content`); no folder pages. Default: `true`.
   */
  readonly mounted?: boolean;
  /** Folders with a page of their own, mounted like entries; `null` or absent for none. */
  readonly folderPages?: FolderPagesInput<SegmentNames<G>> | null;
}

/** Which folders of a collection have a page. */
export interface FolderPagesInput<N extends string = string> {
  /** The collection's own page (its `base`). Default: `false`. */
  readonly root?: boolean;
  /** The named segments whose folders have a page, e.g. `['category', 'subcategory']`. */
  readonly levels: readonly N[];
  /** Latest entries shown per subfolder, newest first by `metadata.publishedTime`. Default: 2. */
  readonly preview?: number;
  /**
   * An image per folder, by its path (its segment values joined by `/`, e.g. `'news'`, `'news/bot'`), for its previews
   * and its Open Graph image; a folder without one takes its newest entry's image.
   */
  readonly images?: Readonly<Record<string, string>>;
  /**
   * Items per page, by level (`root` for the collection's own page): entries for a folder listing entries, subfolders
   * for one listing subfolders. A folder holding more has its first page at its own URL, the others at `…/page/2`,
   * `…/page/3`, each prerendered with its slice only. A level without a size lists everything on one page.
   */
  readonly perPage?: { readonly [K in N]?: number } & { readonly root?: number };
}

/**
 * A collection's folder pages, validated, defaults applied: whether its root has a page, the segments whose folders
 * have one, how many entries each child folder previews, and an image per folder path.
 */
export interface FolderPages<N extends string = string> {
  readonly root: boolean;
  readonly levels: readonly N[];
  readonly preview: number;
  readonly images: Readonly<Record<string, string>>;
  /** Items per page, by level (`root` for the collection's own page); none: one page. */
  readonly perPage: Readonly<Record<string, number>>;
}

/** A validated, frozen collection declaration (plain, serializable data). */
export interface Collection<E extends string = string, G extends readonly GrammarPart[] = readonly GrammarPart[]> {
  readonly entry: E;
  readonly base: string;
  readonly grammar: G;
  readonly route: readonly RoutePart<RouteNames<G>>[];
  readonly indexForbiddenUnder: readonly SegmentNames<G>[];
  readonly indexForbiddenAtRoot: boolean;
  readonly reserved: readonly string[];
  readonly maxNameLength: number;
  readonly references: Readonly<Record<string, string>>;
  readonly draft: string | null;
  readonly testOnly: readonly string[];
  readonly messages: { readonly [K in SegmentNames<G>]?: readonly string[] };
  readonly metadata: MetadataFields;
  readonly searchable: boolean;
  /** `false` when its entries have no page: read through their getters only. */
  readonly mounted: boolean;
  /** `null` when no folder has a page. */
  readonly folderPages: FolderPages<SegmentNames<G>> | null;
}

const IDENTIFIER = /^[a-z][a-zA-Z0-9]*$/;
const RESERVED_SEGMENT_NAMES: readonly string[] = ['slug', 'locale'];
const DEFAULT_MAX_NAME_LENGTH = 80;

function fail(entry: string, problem: string): never {
  throw new InvalidCollectionError(`Collection "${entry}": ${problem}.`);
}

/**
 * Whether an entry key matches a reservation: an exact key, or `prefix/*` for the prefix's descendants.
 *
 * @param key - An entry key.
 * @param pattern - A reservation: `lp/sign-up`, or `lp/*` for the prefix's descendants only.
 * @returns Whether the key is reserved by it.
 */
export function matchesReservation(key: string, pattern: string): boolean {
  return pattern.endsWith('/*') ? key.startsWith(`${pattern.slice(0, -2)}/`) : key === pattern;
}

function isValidKeyPath(path: string): boolean {
  return path.split('/').every(isValidName);
}

/** Whether a grammar part is a named segment (fixed or rest): the guard keeps the part's literal name. */
const isNamed = <P extends GrammarPart>(part: P): part is Extract<P, { readonly kind: 'segment' | 'rest' }> =>
  part.kind === 'segment' || part.kind === 'rest';

/** The grammar's segment names, in order, typed after the grammar itself. */
function segmentNamesOf<G extends readonly GrammarPart[]>(grammar: G): SegmentNames<G>[] {
  const names: SegmentNames<G>[] = [];

  for (const part of grammar) if (isNamed(part)) names.push(part.name);

  return names;
}

function validateGrammar<G extends readonly GrammarPart[]>(entry: string, grammar: G): readonly SegmentNames<G>[] {
  const last = grammar.at(-1);

  if (last?.kind !== 'slug') fail(entry, 'the grammar must end with slug()');

  const count = (kind: GrammarPart['kind']): number => grammar.filter((part) => part.kind === kind).length;

  if (count('slug') > 1) fail(entry, 'the grammar must contain a single slug()');

  if (count('locale') > 1) fail(entry, 'the grammar must contain at most one locale()');

  if (count('rest') > 1) fail(entry, 'the grammar must contain at most one rest()');

  if (count('rest') === 1 && count('locale') === 1 && grammar[0]?.kind !== 'locale') {
    fail(entry, 'with a rest() segment, locale() must be the first part of the grammar');
  }

  const names = segmentNamesOf(grammar);

  for (const name of names) {
    if (!IDENTIFIER.test(name)) fail(entry, `segment name "${name}" must be a camelCase identifier`);

    if (RESERVED_SEGMENT_NAMES.includes(name)) fail(entry, `segment name "${name}" is reserved`);
  }

  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);

  if (duplicates.length > 0) fail(entry, `duplicate segment names: ${duplicates.join(', ')}`);

  return names;
}

/**
 * Why a list of required message fields is invalid, if it is: shared with taxonomies.
 *
 * @param fields - Required message field names.
 * @returns The problem (empty, a duplicate, an invalid name), `undefined` when valid.
 */
export function messageFieldsProblem(fields: readonly string[]): string | undefined {
  if (fields.length === 0) return 'declare at least one field, or none at all';

  for (const field of fields) {
    if (field === '' || field.includes('.') || field === '$') return `invalid field "${field}" (no dot, not "$")`;
  }

  const duplicates = fields.filter((field, index) => fields.indexOf(field) !== index);

  return duplicates.length > 0 ? `duplicate fields: ${duplicates.join(', ')}` : undefined;
}

function validateRoute(entry: string, route: readonly RoutePart[], allowed: readonly string[]): void {
  for (const part of route) {
    const names = typeof part === 'string' ? [part] : part.names;

    if (names.length === 0) fail(entry, 'a join() in the route must name at least one value');

    for (const name of names) {
      if (!allowed.includes(name)) fail(entry, `the route references "${name}", which is not ${allowed.join(', ')}`);
    }
  }
}

/**
 * Validates the declaration and infers segment names. Throws `InvalidCollectionError` on an invalid declaration.
 *
 * @param input - The entry name, the URL base, the grammar, and the collection's options: route, `index` rules,
 *   reservations, references to taxonomies, drafts, test content, required messages, metadata fields,
 *   searchability, folder pages.
 * @returns The frozen declaration, its segment names inferred as literal types.
 * @throws {InvalidCollectionError} On an invalid declaration (a malformed grammar, an unknown segment in an option,
 *   a metadata key or schema type unknown…).
 *
 * @example
 * defineCollection({
 *   entry: 'blogPost',
 *   base: 'blog',
 *   grammar: [segment('category'), segment('subcategory'), locale({ optional: true }), slug()],
 *   indexForbiddenUnder: ['category', 'subcategory'],
 *   references: { tags: 'tags', authors: 'authors' },
 *   metadata: { title: 'title', publishedTime: 'date', type: 'article', schema: 'BlogPosting' },
 *   folderPages: { root: true, levels: ['category', 'subcategory'] },
 * });
 */
export function defineCollection<const E extends string, const G extends readonly GrammarPart[]>(
  input: CollectionInput<E, G>,
): Collection<E, G> {
  const { entry, base, grammar } = input;

  if (!IDENTIFIER.test(entry)) fail(entry, 'the entry name must be a camelCase identifier (e.g. "blogPost")');

  if (base !== '' && !isValidKeyPath(base)) fail(entry, `invalid base "${base}"`);

  const segmentNames = validateGrammar(entry, grammar);

  // Without an explicit route: the grammar's segments in order, then the slug.
  const route: readonly RoutePart<RouteNames<G>>[] = input.route ?? [...segmentNames, 'slug' as const];

  validateRoute(entry, route, [...segmentNames, 'slug']);

  const indexForbiddenUnder = input.indexForbiddenUnder ?? [];

  for (const name of indexForbiddenUnder) {
    if (name === '') fail(entry, 'indexForbiddenUnder cannot name the root: use indexForbiddenAtRoot');

    if (!segmentNames.includes(name)) fail(entry, `indexForbiddenUnder references unknown "${name}"`);
  }

  const indexForbiddenAtRoot: unknown = input.indexForbiddenAtRoot ?? false;

  if (typeof indexForbiddenAtRoot !== 'boolean') fail(entry, 'indexForbiddenAtRoot must be a boolean');

  const maxNameLength = input.maxNameLength ?? DEFAULT_MAX_NAME_LENGTH;

  if (!Number.isInteger(maxNameLength) || maxNameLength < 1) fail(entry, 'maxNameLength must be a positive integer');

  const reserved = input.reserved ?? [];
  const testOnly = input.testOnly ?? [];

  for (const [option, patterns] of [
    ['reserved', reserved],
    ['testOnly', testOnly],
  ] as const) {
    for (const pattern of patterns) {
      const path = pattern.endsWith('/*') ? pattern.slice(0, -2) : pattern;

      if (!isValidKeyPath(path)) fail(entry, `invalid ${option} pattern "${pattern}"`);
    }
  }

  const references = input.references ?? {};

  for (const [field, taxonomy] of Object.entries(references)) {
    if (field === '' || taxonomy === '') fail(entry, 'references must map non-empty fields to non-empty taxonomies');
  }

  const messages: Readonly<Record<string, readonly string[] | undefined>> = input.messages ?? {};
  const known: readonly string[] = segmentNames;

  for (const [name, fields] of Object.entries(messages)) {
    if (!known.includes(name)) fail(entry, `messages references unknown segment "${name}"`);

    if (fields === undefined) continue;

    const problem = messageFieldsProblem(fields);

    if (problem !== undefined) fail(entry, `messages.${name}: ${problem}`);
  }

  const metadata: Readonly<Record<string, unknown>> = { ...input.metadata };

  for (const [key, value] of Object.entries(metadata)) {
    if (key === 'type') {
      if (value !== 'website' && value !== 'article') fail(entry, 'metadata.type must be "website" or "article"');
    } else if (key === 'schema') {
      if (!SCHEMA_TYPES.some((type) => type === value))
        fail(entry, `metadata.schema must be one of ${SCHEMA_TYPES.join(', ')}`);
    } else if (!METADATA_FIELDS.includes(key)) {
      fail(entry, `unknown metadata key "${key}" (expected ${[...METADATA_FIELDS, 'type', 'schema'].join(', ')})`);
    } else if (typeof value !== 'string' || value === '') {
      fail(entry, `metadata.${key} must name a frontmatter field`);
    }
  }

  const searchable: unknown = input.searchable ?? true;

  if (typeof searchable !== 'boolean') fail(entry, 'searchable must be a boolean');

  const draft = input.draft ?? null;

  if (draft === '') fail(entry, 'the draft field must be a non-empty frontmatter field name');

  const folderPages = validateFolderPages(entry, input, grammar);
  const mounted: unknown = input.mounted ?? true;

  if (typeof mounted !== 'boolean') fail(entry, 'mounted must be a boolean');

  if (!mounted && folderPages !== null) fail(entry, 'an unmounted collection has no pages: remove folderPages');

  return Object.freeze({
    entry,
    base,
    // The caller's own tuple, frozen in place: still exactly a `G` (its parts are already frozen by the builders).
    grammar: freezeInPlace(grammar),
    route: Object.freeze([...route]),
    indexForbiddenUnder: Object.freeze([...indexForbiddenUnder]),
    indexForbiddenAtRoot,
    reserved: Object.freeze([...reserved]),
    maxNameLength,
    references: Object.freeze({ ...references }),
    draft,
    testOnly: Object.freeze([...testOnly]),
    metadata: Object.freeze({ ...(input.metadata ?? {}) }),
    searchable,
    mounted,
    folderPages,
    messages: frozenMessages(segmentNames, input.messages ?? {}),
  });
}

/** Freezes a value in place and gives it back with its own type (`Object.freeze` would give `Readonly<T>`). */
function freezeInPlace<T>(value: T): T {
  Object.freeze(value);

  return value;
}

/** The declared message fields, read segment by segment from the grammar's names, frozen. */
function frozenMessages<N extends string>(
  names: readonly N[],
  messages: { readonly [K in N]?: readonly string[] },
): { readonly [K in N]?: readonly string[] } {
  const out: { [K in N]?: readonly string[] } = {};

  for (const name of names) {
    const fields = messages[name];

    if (fields !== undefined) out[name] = Object.freeze([...fields]);
  }

  return Object.freeze(out);
}

/** `folderPages.images`: folder paths of valid names, no deeper than the named segments, to an image each. */
function validateFolderImages(entry: string, images: unknown, depth: number): Readonly<Record<string, string>> {
  if (typeof images !== 'object' || images === null || Array.isArray(images))
    fail(entry, 'folderPages.images must map folder paths to images, e.g. { news: "/covers/news.jpeg" }');

  const checked: Record<string, string> = {};

  for (const [path, image] of Object.entries(images)) {
    const parts = path.split('/');

    if (parts.length > depth || !parts.every((part) => isValidName(part)))
      fail(
        entry,
        `folderPages.images: "${path}" is not a folder path (lowercase names joined by "/", ${String(depth)} at most)`,
      );

    if (typeof image !== 'string' || image.trim() === '')
      fail(entry, `folderPages.images: the image of "${path}" must be a non-empty string`);

    checked[path] = image;
  }

  return Object.freeze(checked);
}

/** `folderPages.perPage`: a whole size of 1 or more per declared level, or for the root when it has its page. */
function validatePerPage(
  entry: string,
  perPage: unknown,
  levels: readonly string[],
  root: boolean,
): Readonly<Record<string, number>> {
  if (typeof perPage !== 'object' || perPage === null || Array.isArray(perPage))
    fail(entry, 'folderPages.perPage must map levels to page sizes, e.g. { subcategory: 10 }');

  const sizes: Record<string, number> = {};

  for (const [name, size] of Object.entries(perPage)) {
    if (!(name === 'root' ? root : levels.includes(name)))
      fail(
        entry,
        `folderPages.perPage names "${name}", which has no page (expected ${[...(root ? ['root'] : []), ...levels].join(', ')})`,
      );

    if (typeof size !== 'number' || !Number.isInteger(size) || size < 1)
      fail(entry, `folderPages.perPage: the page size of "${name}" must be a whole number, 1 or more`);

    sizes[name] = size;
  }

  return Object.freeze(sizes);
}

/** `folderPages`: named, fixed segments only (a free-depth folder has its `index.mdx`), the default route. */
function validateFolderPages<E extends string, G extends readonly GrammarPart[]>(
  entry: string,
  input: CollectionInput<E, G>,
  grammar: G,
): FolderPages<SegmentNames<G>> | null {
  const folderPages: unknown = input.folderPages;

  if (folderPages === undefined || folderPages === null) return null;

  if (typeof folderPages !== 'object') fail(entry, 'folderPages must be { levels, root?, preview? }');

  const {
    root = false,
    levels,
    preview = 2,
    images = {},
    perPage = {},
  }: Readonly<Record<string, unknown>> = { ...folderPages };

  if (typeof root !== 'boolean') fail(entry, 'folderPages.root must be a boolean');

  const segments = grammar.flatMap((part) => (part.kind === 'segment' ? [part.name] : []));
  const names = segmentNamesOf(grammar);
  // A level is one of the grammar's named segments: checked, and typed so.
  const isLevel = (value: unknown): value is SegmentNames<G> =>
    typeof value === 'string' && segments.includes(value) && names.some((name) => name === value);
  const rests = grammar.flatMap((part) => (part.kind === 'rest' ? [part.name] : []));

  if (!Array.isArray(levels)) fail(entry, 'folderPages.levels must list segment names');

  const checked: SegmentNames<G>[] = [];

  for (const level of levels) {
    if (typeof level === 'string' && rests.includes(level))
      fail(entry, `folderPages.levels cannot name the free-depth segment "${level}": its folders use index.mdx`);

    if (!isLevel(level))
      fail(entry, `folderPages.levels references unknown segment "${String(level)}" (expected ${segments.join(', ')})`);

    checked.push(level);
  }

  if (typeof preview !== 'number' || !Number.isInteger(preview) || preview < 0)
    fail(entry, 'folderPages.preview must be a whole number, 0 or more');

  // The default composition: the segments in grammar order, then the slug (a folder's URL is then a prefix).
  const named = grammar.flatMap((part) => (part.kind === 'segment' || part.kind === 'rest' ? [part.name] : []));
  const route = input.route ?? [...named, 'slug'];
  const isDefault = route.length === named.length + 1 && route.every((part, i) => part === [...named, 'slug'][i]);

  if (!isDefault) fail(entry, 'folderPages needs the default route composition (no custom `route`)');

  return Object.freeze({
    root: root,
    levels: Object.freeze([...checked]),
    preview: preview,
    images: validateFolderImages(entry, images, segments.length),
    perPage: validatePerPage(entry, perPage, checked, root),
  });
}
