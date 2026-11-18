/**
 * The assembly: the structural analysis joined with the delegated tool's documents, by collection and path.
 *
 * Key design decisions:
 *     - An entry exists only if its structure, its frontmatter (validated by the user's schema) and its taxonomy
 *       references (checked here, with suggestions) are valid, and the injected environment keeps it.
 *     - Structural diagnostics never depend on the frontmatter's validity.
 *     - Metadata fields are type-checked at build time (`invalid-metadata-field`): texts, a list of texts, robots
 *       directives, an absolute canonical.
 *
 * Invariants (`assemble.test.ts`): deterministic; a structural error still reported with an invalid frontmatter.
 */
import type { Analysis, SourceInput } from '../paths/analyze.js';
import { matchesReservation, type Collection } from '../declarations/collection.js';
import { compareDiagnostics, diagnostic, type Diagnostic, type FileErrorDiagnostic } from '../shared/diagnostics.js';
import type { EntryDescriptor } from '../paths/descriptor.js';
import type { Environment, SourceDocument } from './ports.js';
import { combine, err, map, ok, type Result } from '../shared/result.js';
import { suggest } from '../shared/suggest.js';
import type { Taxonomy } from '../declarations/taxonomy.js';

/** An entry whose structure, frontmatter and references are all valid. */
export interface Entry {
  readonly descriptor: EntryDescriptor;
  readonly data: Readonly<Record<string, unknown>>;
  readonly body: string;
  /** Referenced taxonomy terms, per declared field. */
  readonly terms: Readonly<Record<string, readonly string[]>>;
  readonly draft: boolean;
}

/** What `assemble` gives: the kept entries, every diagnostic, the excluded entries and the structure. */
export interface Assembly {
  /** Valid entries kept by the environment, in descriptor order. */
  readonly entries: readonly Entry[];
  /** Every diagnostic: structural, delegated tool, taxonomy; sorted and deterministic. */
  readonly diagnostics: readonly Diagnostic[];
  /** Valid entries excluded by the environment (drafts, test content), for the CLI summary. */
  readonly excluded: readonly { readonly entry: SourceInput; readonly reason: 'draft' | 'test-content' }[];
  /** Every structurally valid entry, whatever its frontmatter or the environment: what messages derive from. */
  readonly structure: readonly EntryDescriptor[];
}

/** What `assemble` joins: the structural analysis, the content source's documents and diagnostics, the declarations and the environment. */
export interface AssembleInput {
  readonly analysis: Analysis;
  readonly documents: readonly SourceDocument[];
  readonly sourceDiagnostics: readonly Diagnostic[];
  readonly collections: Readonly<Record<string, Collection>>;
  readonly taxonomies: Readonly<Record<string, Taxonomy>>;
  readonly environment: Environment;
}

type Located<D> = D extends unknown ? Omit<D, 'collection' | 'sourcePath'> : never;

function located(entry: EntryDescriptor, error: Located<FileErrorDiagnostic>): FileErrorDiagnostic {
  return diagnostic({ ...error, collection: entry.collection, sourcePath: entry.sourcePath });
}

function checkDraft(entry: EntryDescriptor, collection: Collection, data: SourceDocument['data']) {
  if (collection.draft === null) return ok(false);

  const value = data[collection.draft];

  if (value === undefined) return ok(false);

  if (typeof value === 'boolean') return ok(value);

  return err(
    located(entry, {
      code: 'invalid-draft-flag',
      severity: 'error',
      data: { field: collection.draft },
      suggestions: [],
    }),
  );
}

/** One robots directive (Google's and the standard's): `noindex`, `max-snippet:-1`, `unavailable_after: …`. */
const ROBOTS_DIRECTIVE =
  /^(all|none|index|noindex|follow|nofollow|noarchive|nocache|nosnippet|noimageindex|notranslate|indexifembedded|(max-snippet|max-video-preview):-?\d+|max-image-preview:(none|standard|large)|unavailable_after:.+)$/i;

/** Whether a text is a list of robots directives, comma-separated. */
const isRobotsDirectives = (value: string): boolean =>
  value.split(',').every((directive) => ROBOTS_DIRECTIVE.test(directive.trim()));

const isAbsoluteUrl = (value: string): boolean => /^https?:\/\/[^\s/?#]+[^\s]*$/i.test(value);

type MetadataExpectation = 'text' | 'list of texts' | 'robots directives' | 'absolute URL' | 'number';

/** What a declared metadata field's value must be, or `undefined` when it is fine (absent values are fine). */
function metadataProblem(kind: MetadataExpectation, value: unknown): MetadataExpectation | undefined {
  if (value === undefined) return undefined;

  if (kind === 'list of texts')
    return Array.isArray(value) && value.every((item) => typeof item === 'string') ? undefined : kind;

  if (kind === 'number') return typeof value === 'number' && Number.isFinite(value) ? undefined : kind;

  if (typeof value !== 'string') return kind;

  if (kind === 'robots directives') return isRobotsDirectives(value) ? undefined : kind;

  if (kind === 'absolute URL') return isAbsoluteUrl(value) ? undefined : kind;

  return undefined;
}

/** Checks the declared metadata fields of one entry: texts, a list of texts for `tags`, robots and canonical. */
function checkMetadata(entry: EntryDescriptor, collection: Collection, data: SourceDocument['data']) {
  const { title, description, image, publishedTime, modifiedTime, tags, robots, canonical, order } =
    collection.metadata;
  const checks: readonly (readonly [string | undefined, MetadataExpectation])[] = [
    [title, 'text'],
    [description, 'text'],
    [image, 'text'],
    [publishedTime, 'text'],
    [modifiedTime, 'text'],
    [tags, 'list of texts'],
    [robots, 'robots directives'],
    [canonical, 'absolute URL'],
    [order, 'number'],
  ];
  const problems: FileErrorDiagnostic[] = checks.flatMap(([field, kind]) => {
    if (field === undefined) return [];

    const expected = metadataProblem(kind, data[field]);

    return expected === undefined
      ? []
      : [
          located(entry, {
            code: 'invalid-metadata-field',
            severity: 'error',
            data: { field, expected },
            suggestions: [],
          }),
        ];
  });
  const [first, ...rest] = problems;

  return first === undefined ? ok(null) : err(first, ...rest);
}

/** Checks one reference field: shape, unknown terms (with suggestions), duplicates. */
function checkReference(
  entry: EntryDescriptor,
  field: string,
  taxonomyName: string,
  taxonomy: Taxonomy,
  value: unknown,
): Result<readonly [string, readonly string[]], FileErrorDiagnostic> {
  const terms = value === undefined ? [] : typeof value === 'string' ? [value] : value;

  if (!Array.isArray(terms) || !terms.every((term): term is string => typeof term === 'string')) {
    return err(
      located(entry, {
        code: 'invalid-taxonomy-reference',
        severity: 'error',
        data: { field, taxonomy: taxonomyName },
        suggestions: [],
      }),
    );
  }

  const unknown = terms
    .filter((term) => !taxonomy.terms.includes(term))
    .map((term) =>
      err<FileErrorDiagnostic>(
        located(entry, {
          code: 'unknown-taxonomy-term',
          severity: 'error',
          data: { field, taxonomy: taxonomyName, term },
          suggestions: suggest(term, taxonomy.terms),
        }),
      ),
    );
  const duplicates = [...new Set(terms.filter((term, index) => terms.indexOf(term) !== index))].map((term) =>
    err<FileErrorDiagnostic>(
      located(entry, { code: 'duplicate-taxonomy-term', severity: 'error', data: { field, term }, suggestions: [] }),
    ),
  );

  return map(combine([...unknown, ...duplicates]), () => [field, terms] as const);
}

/**
 * A taxonomy's content entry is named after one of its terms: its key is the term.
 *
 * @param entry - The entry.
 * @param taxonomies - The declared taxonomies.
 * @returns Nothing when its collection holds no taxonomy's content, or when its key is a term; otherwise an
 *   `unknown-term-content` error with the closest terms.
 */
function checkTermContent(
  entry: EntryDescriptor,
  taxonomies: Readonly<Record<string, Taxonomy>>,
): Result<null, FileErrorDiagnostic> {
  const unknown = Object.entries(taxonomies)
    .filter(([, taxonomy]) => taxonomy.content === entry.collection && !taxonomy.terms.includes(entry.key))
    .map(([name, taxonomy]) =>
      err<FileErrorDiagnostic>(
        located(entry, {
          code: 'unknown-term-content',
          severity: 'error',
          data: { taxonomy: name, term: entry.key },
          suggestions: suggest(entry.key, taxonomy.terms),
        }),
      ),
    );

  return map(combine(unknown), () => null);
}

/**
 * Checks that every reference field of every collection points to a declared taxonomy.
 *
 * @param collections - The collections.
 * @param taxonomies - The declared taxonomies.
 * @throws {TypeError} When a collection references an undeclared taxonomy: invalid input.
 */
export function resolveTaxonomies(
  collections: Readonly<Record<string, Collection>>,
  taxonomies: Readonly<Record<string, Taxonomy>>,
): void {
  for (const [name, collection] of Object.entries(collections)) {
    for (const [field, taxonomy] of Object.entries(collection.references)) {
      if (taxonomies[taxonomy] === undefined) {
        throw new TypeError(`Collection "${name}": field "${field}" references an undeclared taxonomy "${taxonomy}".`);
      }
    }
  }
}

/** Outcome of joining one structurally valid entry with its document. */
export type JoinOutcome =
  | { readonly kind: 'entry'; readonly entry: Entry }
  | { readonly kind: 'excluded'; readonly reason: 'draft' | 'test-content' }
  | { readonly kind: 'errors'; readonly errors: readonly FileErrorDiagnostic[] };

/**
 * Joins one entry with its document: shared by `assemble` and `streamContent`.
 *
 * @param descriptor - The entry's structure.
 * @param document - Its validated document.
 * @param collection - Its collection.
 * @param taxonomies - The declared taxonomies.
 * @param environment - Whether drafts and test content are kept.
 * @returns The entry (its references resolved, its metadata fields checked), its exclusion (a draft, test content),
 *   or its errors.
 */
export function joinEntry(
  descriptor: EntryDescriptor,
  document: SourceDocument,
  collection: Collection,
  taxonomies: Readonly<Record<string, Taxonomy>>,
  environment: Environment,
): JoinOutcome {
  const references = Object.entries(collection.references).flatMap(([field, taxonomyName]) => {
    // An unknown taxonomy was already reported by `resolveTaxonomies`, before any join.
    const taxonomy = taxonomies[taxonomyName];

    return taxonomy === undefined
      ? []
      : [checkReference(descriptor, field, taxonomyName, taxonomy, document.data[field])];
  });
  const checked = combine([
    checkDraft(descriptor, collection, document.data),
    combine(references),
    checkMetadata(descriptor, collection, document.data),
    checkTermContent(descriptor, taxonomies),
  ]);

  if (!checked.ok) return { kind: 'errors', errors: checked.errors };

  const [draft, resolved] = checked.value;

  if (draft && environment.drafts === 'exclude') return { kind: 'excluded', reason: 'draft' };

  if (
    environment.testContent === 'exclude' &&
    collection.testOnly.some((pattern) => matchesReservation(descriptor.key, pattern))
  ) {
    return { kind: 'excluded', reason: 'test-content' };
  }

  return {
    kind: 'entry',
    entry: Object.freeze({
      descriptor,
      data: document.data,
      body: document.body,
      terms: Object.freeze(Object.fromEntries(resolved)),
      draft,
    }),
  };
}

/**
 * `testOnly` patterns matching no structurally valid entry.
 *
 * @param collections - The collections.
 * @param descriptors - Every structurally valid entry.
 * @returns One warning per pattern matching nothing.
 */
export function unusedTestOnly(
  collections: Readonly<Record<string, Collection>>,
  descriptors: readonly EntryDescriptor[],
): Diagnostic[] {
  return Object.entries(collections).flatMap(([name, collection]) => {
    const keys = [...new Set(descriptors.filter((e) => e.collection === name).map((e) => e.key))];

    return collection.testOnly
      .filter((pattern) => !keys.some((key) => matchesReservation(key, pattern)))
      .map((pattern) =>
        diagnostic({
          code: 'unused-test-only',
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
 * The `missing-document` diagnostic of a structurally valid entry that got neither a document nor an error.
 *
 * @param descriptor - The entry.
 * @returns The diagnostic, located.
 */
export function missingDocument(descriptor: EntryDescriptor): FileErrorDiagnostic {
  return located(descriptor, { code: 'missing-document', severity: 'error', data: {}, suggestions: [] });
}

/**
 * The join key of a file: its collection and path.
 *
 * @param source - A source path and its collection.
 * @returns A key unique per file.
 */
export const idOf = (source: SourceInput): string => `${source.collection}\u0000${source.sourcePath}`;

/**
 * Deterministic order of exclusions.
 *
 * @param a - An exclusion.
 * @param b - Another.
 * @returns The order: by collection, then path.
 */
export function compareExcluded(a: { readonly entry: SourceInput }, b: { readonly entry: SourceInput }): number {
  return idOf(a.entry) < idOf(b.entry) ? -1 : idOf(a.entry) > idOf(b.entry) ? 1 : 0;
}

/**
 * Joins a structural analysis with the delegated tool's documents.
 *
 * @param input - The analysis, the documents, the source's diagnostics, the collections, the taxonomies, the
 *   environment.
 * @returns The assembly: an entry exists only if its structure, frontmatter and references are valid and the
 *   environment keeps it; every diagnostic, sorted; deterministic, whatever the documents' order.
 * @throws {TypeError} On a reference to an undeclared taxonomy or a duplicated document: invalid input.
 *
 * @example
 * const assembly = assemble({
 *   analysis, documents, sourceDiagnostics, collections, taxonomies,
 *   environment: { drafts: 'exclude', testContent: 'exclude' },
 * });
 */
export function assemble(input: AssembleInput): Assembly {
  const { analysis, collections, taxonomies, environment } = input;

  resolveTaxonomies(collections, taxonomies);

  const documents = new Map<string, SourceDocument>();

  for (const document of input.documents) {
    if (documents.has(idOf(document))) throw new TypeError(`assemble: duplicated document "${document.sourcePath}".`);

    documents.set(idOf(document), document);
  }

  const failedInSource = new Set(
    input.sourceDiagnostics.flatMap((d) =>
      d.severity === 'error' && d.sourcePath !== null
        ? [idOf({ collection: d.collection, sourcePath: d.sourcePath })]
        : [],
    ),
  );

  const diagnostics: Diagnostic[] = [...analysis.diagnostics, ...input.sourceDiagnostics];
  const entries: Entry[] = [];
  const excluded: { entry: SourceInput; reason: 'draft' | 'test-content' }[] = [];

  for (const descriptor of analysis.entries) {
    const collection = collections[descriptor.collection];

    if (collection === undefined) continue;

    const document = documents.get(idOf(descriptor));

    if (document === undefined) {
      if (!failedInSource.has(idOf(descriptor))) {
        diagnostics.push(missingDocument(descriptor));
      }

      continue;
    }

    const outcome = joinEntry(descriptor, document, collection, taxonomies, environment);

    if (outcome.kind === 'entry') entries.push(outcome.entry);
    else if (outcome.kind === 'excluded') {
      excluded.push({
        entry: { collection: descriptor.collection, sourcePath: descriptor.sourcePath },
        reason: outcome.reason,
      });
    } else diagnostics.push(...outcome.errors);
  }

  diagnostics.push(...unusedTestOnly(collections, analysis.entries));

  return Object.freeze({
    entries: Object.freeze(entries),
    diagnostics: Object.freeze(diagnostics.sort(compareDiagnostics)),
    excluded: Object.freeze(excluded.sort(compareExcluded)),
    structure: analysis.entries,
  });
}
