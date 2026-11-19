/**
 * Taxonomies: closed lists of terms, declared as pure data in the config, never with UI components.
 *
 * Key design decisions:
 *     - Terms are referenced by key from the frontmatter and checked after the join, with suggestions.
 *     - Each term may require message fields (a tag's label, an author's name and bio), checked in every locale.
 *     - A taxonomy may give each term a page, mounted like an entry where the term is used.
 *     - A term may have content of its own (an author's long bio): an entry per term and locale in an unmounted
 *       collection named by `content`, its key the term; optional per term and locale, shown on the term's page.
 *
 * Invariants (`taxonomy.test.ts`): deep copies frozen, the caller's object untouched; invalid declarations throw.
 */
import { isValidName, sanitizeName } from '../shared/names.js';
import { messageFieldsProblem } from './collection.js';

/** Thrown by `defineTaxonomy` on an invalid declaration (invalid configuration is the only case where core throws). */
export class InvalidTaxonomyError extends Error {
  override readonly name = 'InvalidTaxonomyError';
}

/** A closed list of terms that the frontmatter can reference, with optional pure data per term. */
export interface Taxonomy<T extends string = string, D = unknown> {
  readonly terms: readonly T[];
  /** Pure data per term (e.g. an author's avatar and socials), never UI components; `null` for a plain list. */
  readonly data: D;
  /** Fields every term must have in every locale's messages, e.g. a tag's `label`. */
  readonly messages: readonly string[];
  /** A page per term at `/<base>/<term>`, or `null`. */
  readonly pages: TermPages | null;
  /** The unmounted collection holding each term's content (its entries keyed by term), or `null`. */
  readonly content: string | null;
}

/** Where a taxonomy's term pages live, and how many entries each page lists. */
export interface TermPages {
  /** The URL segment before the term, e.g. `authors`. */
  readonly base: string;
  /**
   * Entries per page: a term with more is mounted once per slice, its first page at its own URL, the next ones at
   * `…/page/2`, each prerendered with its slice only. Every entry on one page without it.
   */
  readonly perPage?: number;
}

function validate(terms: readonly string[]): void {
  if (terms.length === 0) throw new InvalidTaxonomyError('A taxonomy must declare at least one term.');

  for (const term of terms) {
    if (term === '' || term.trim() !== term) {
      throw new InvalidTaxonomyError(`Invalid taxonomy term ${JSON.stringify(term)}: empty or surrounded by spaces.`);
    }
  }

  const duplicates = terms.filter((term, index) => terms.indexOf(term) !== index);

  if (duplicates.length > 0) throw new InvalidTaxonomyError(`Duplicate taxonomy terms: ${duplicates.join(', ')}.`);
}

/** Frozen deep copy of pure data (plain objects and arrays): the caller's object is never frozen in place. */
function frozenCopy(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map(frozenCopy));

  if (typeof value === 'object' && value !== null) {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([k, v]) => [k, frozenCopy(v)])));
  }

  return value;
}

/**
 * What a taxonomy may also declare: required message fields per term, term pages, and each term's content.
 *
 */
export interface TaxonomyOptions {
  /** Fields every term must have in every locale's messages. */
  readonly messages?: readonly string[];
  /** A page per term: `{ base: 'authors' }` mounts `/authors/<term>`; `perPage` slices a term's entries. */
  readonly pages?: TermPages;
  /**
   * The unmounted collection (`mounted: false`) holding each term's content, its entries keyed by term: an
   * author's long bio in `content/authors/<term>.mdx`, shown on the term's page. Requires `pages`.
   */
  readonly content?: string;
}

/** Term pages: a valid base, and every term a valid URL segment (the naming rule of segments). */
function validatePages(pages: unknown, terms: readonly string[]): TermPages | null {
  if (pages === undefined) return null;

  const base: unknown = typeof pages === 'object' && pages !== null ? Reflect.get(pages, 'base') : undefined;

  if (typeof base !== 'string' || !isValidName(base)) {
    throw new InvalidTaxonomyError(`Taxonomy pages: \`base\` must be a lowercase URL segment, e.g. "authors".`);
  }

  const invalid = terms.filter((term) => !isValidName(term));

  if (invalid.length > 0) {
    const fixes = invalid.map((term) => `${term} → ${sanitizeName(term) || '?'}`).join(', ');

    throw new InvalidTaxonomyError(`Taxonomy pages: every term must be a lowercase URL segment (${fixes}).`);
  }

  const perPage: unknown = typeof pages === 'object' && pages !== null ? Reflect.get(pages, 'perPage') : undefined;

  if (perPage === undefined) return Object.freeze({ base });

  if (typeof perPage !== 'number' || !Number.isInteger(perPage) || perPage < 1) {
    throw new InvalidTaxonomyError('Taxonomy pages: `perPage` must be a whole number, 1 or more, e.g. 10.');
  }

  return Object.freeze({ base, perPage });
}

/** The list form of a taxonomy: `Array.isArray` does not narrow a readonly array out of the union, a guard does. */
const isTermList = (input: readonly string[] | Readonly<Record<string, unknown>>): input is readonly string[] =>
  Array.isArray(input);

/**
 * Declares a taxonomy: a closed list of terms the frontmatter references (tags, authors).
 *
 * @param terms - The terms, as a list, or as a record of terms with their pure data (an author's avatar…).
 * @param options - Message fields each term requires in every locale, term pages (`pages: { base }`), and the
 *   collection holding each term's content (`content`).
 * @returns The frozen declaration; the caller's data is deep-copied, never frozen in place.
 * @throws {InvalidTaxonomyError} On an invalid declaration: no term, an empty term, a duplicate, invalid message
 *   fields, or, when the taxonomy has pages, an invalid base, a term that is not a valid URL segment or a page size
 *   that is not a whole number of 1 or more; `content` without pages, or not a collection's name.
 *
 * @example
 * defineTaxonomy(['guide', 'release'], { messages: ['label'] });
 * defineTaxonomy({ gustave: { avatar: '/authors/gustave.svg' } }, { messages: ['name', 'bio'], pages: { base: 'authors' } });
 */
export function defineTaxonomy<const T extends string>(
  terms: readonly T[],
  options?: TaxonomyOptions,
): Taxonomy<T, null>;
export function defineTaxonomy<const R extends Readonly<Record<string, unknown>>>(
  terms: R,
  options?: TaxonomyOptions,
): Taxonomy<keyof R & string, R>;
export function defineTaxonomy(
  input: readonly string[] | Readonly<Record<string, unknown>>,
  options: TaxonomyOptions = {},
): Taxonomy {
  const isList = isTermList(input);
  const terms = isTermList(input) ? [...input] : Object.keys(input);

  validate(terms);
  const messages = options.messages ?? [];
  const problem = messages.length === 0 ? undefined : messageFieldsProblem(messages);

  if (problem !== undefined) throw new InvalidTaxonomyError(`Taxonomy messages: ${problem}.`);

  const content: unknown = options.content ?? null;

  if (content !== null) {
    if (typeof content !== 'string' || !/^[a-z][a-zA-Z0-9]*$/.test(content))
      throw new InvalidTaxonomyError('Taxonomy content: name the collection holding it, e.g. "authorBios".');

    if (options.pages === undefined)
      throw new InvalidTaxonomyError('Taxonomy content is shown on the term pages: declare `pages` too.');
  }

  return Object.freeze({
    terms: Object.freeze(terms),
    data: isList ? null : frozenCopy(input),
    messages: Object.freeze([...messages]),
    pages: validatePages(options.pages, terms),
    content,
  });
}
