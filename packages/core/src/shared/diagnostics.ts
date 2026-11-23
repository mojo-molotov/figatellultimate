/**
 * Diagnostics: every problem the content can have, as data, discriminated by `code`.
 *
 * Key design decisions:
 *     - Data only, no message text: the CLI formats each code in English (where, why, how to fix); tests compare data.
 *     - A fixed severity per code: an error or a warning, never configurable.
 *     - Paths are collection-relative POSIX paths, never absolute: nothing of the machine leaks into a report.
 *     - "Did you mean" suggestions travel with the diagnostic.
 *     - A deterministic order (`compareDiagnostics`), whatever the input's.
 */
interface DiagnosticOf<C extends string, S extends 'error' | 'warning', D, P extends string | null = string> {
  readonly code: C;
  readonly severity: S;
  readonly collection: string;
  /** Collection-relative POSIX path; `null` for diagnostics about the declaration itself. */
  readonly sourcePath: P;
  readonly data: D;
  /** Fix suggestions ("did you mean", sanitized names…), possibly empty. */
  readonly suggestions: readonly string[];
}

/** Which part of the path a name belongs to: a segment name, or `'slug'`. */
type NamePart = string;

/** A folder or file name breaking the naming rule (lowercase letters, digits and dashes); the sanitized name suggested. */
export type InvalidNameDiagnostic = DiagnosticOf<
  'invalid-name',
  'error',
  { readonly name: string; readonly part: NamePart }
>;
/** A folder or file name longer than the collection allows. */
export type NameTooLongDiagnostic = DiagnosticOf<
  'name-too-long',
  'error',
  { readonly name: string; readonly part: NamePart; readonly length: number; readonly max: number }
>;
/** A file at a depth the collection's grammar does not accept, with the expected shape. */
export type UnexpectedDepthDiagnostic = DiagnosticOf<
  'unexpected-depth',
  'error',
  { readonly expected: string; readonly folders: number }
>;
/** A folder at the locale position that is not a declared locale. */
export type UnknownLocaleDiagnostic = DiagnosticOf<
  'unknown-locale',
  'error',
  { readonly folder: string; readonly locales: readonly string[] }
>;
/** A file outside any locale folder, in the explicit notation. */
export type MissingLocaleDiagnostic = DiagnosticOf<'missing-locale', 'error', { readonly locales: readonly string[] }>;
/** An `index.mdx` where the collection forbids one (at its root, or directly under a segment). */
export type IndexForbiddenDiagnostic = DiagnosticOf<
  'index-forbidden',
  'error',
  /** Segment directly above the index file; `null` for the collection root. */
  { readonly under: string | null }
>;
/** Two versions of one entry in the default locale (implicit and explicit notations mixed). */
export type DuplicateDefaultLocaleDiagnostic = DiagnosticOf<
  'duplicate-default-locale',
  'error',
  { readonly key: string; readonly locale: string; readonly others: readonly string[] }
>;
/** Two files resolving to the same entry in one locale. */
export type KeyCollisionDiagnostic = DiagnosticOf<
  'key-collision',
  'error',
  { readonly key: string; readonly locale: string; readonly others: readonly string[] }
>;
/** Two entries, possibly of different collections, with the same URL. */
export type UrlCollisionDiagnostic = DiagnosticOf<
  'url-collision',
  'error',
  { readonly url: string; readonly others: readonly { readonly collection: string; readonly sourcePath: string }[] }
>;
/** An entry whose URL is a folder page's, e.g. an `index.mdx` in a folder that has its own page. */
export type FolderPageCollisionDiagnostic = DiagnosticOf<
  'folder-page-collision',
  'error',
  { readonly url: string; readonly level: string | null }
>;
/** A term page whose URL is an entry's or a folder page's: on the entry, or on the folder's collection. */
export type TermPageCollisionDiagnostic = DiagnosticOf<
  'term-page-collision',
  'error',
  { readonly url: string; readonly taxonomy: string; readonly term: string },
  string | null
>;
/** Two files differing only by case: one file on case-insensitive file systems. */
export type CaseCollisionDiagnostic = DiagnosticOf<'case-collision', 'error', { readonly others: readonly string[] }>;
/** A file next to a folder of the same name: `a.mdx` beside `a/`, better moved to `a/index.mdx`. */
export type UglyIndexDiagnostic = DiagnosticOf<'ugly-index', 'warning', { readonly folder: string }>;
/** A folder image declared for a folder the content does not have. */
export type UnusedFolderImageDiagnostic = DiagnosticOf<
  'unused-folder-image',
  'warning',
  { readonly path: string },
  null
>;
/** A `reserved` pattern matching no entry: a typo, or a route that no longer needs it. */
export type UnusedReservationDiagnostic = DiagnosticOf<
  'unused-reservation',
  'warning',
  { readonly pattern: string },
  null
>;

// Delegated content source, taxonomies, drafts.
/** A frontmatter field the collection requires, absent. */
export type MissingFrontmatterFieldDiagnostic = DiagnosticOf<
  'missing-frontmatter-field',
  'error',
  { readonly field: string }
>;
/** A frontmatter field rejected by the collection's schema. */
export type InvalidFrontmatterFieldDiagnostic = DiagnosticOf<
  'invalid-frontmatter-field',
  'error',
  /** `message` is the schema library's text. */
  { readonly field: string; readonly message: string }
>;
/** Frontmatter rejected by the collection's schema as a whole. */
export type InvalidFrontmatterDiagnostic = DiagnosticOf<'invalid-frontmatter', 'error', { readonly message: string }>;
/** A file the content source could not read. */
export type UnreadableSourceDiagnostic = DiagnosticOf<'unreadable-source', 'error', { readonly message: string }>;
/** `inherit:` names a locale the site does not declare; the closest locales suggested. */
export type UnknownInheritLocaleDiagnostic = DiagnosticOf<
  'unknown-inherit-locale',
  'error',
  { readonly locale: string }
>;
/** `inherit:` names a locale with no version of this entry (same key) to take its fields from. */
export type MissingInheritSourceDiagnostic = DiagnosticOf<
  'missing-inherit-source',
  'error',
  { readonly locale: string; readonly key: string }
>;
/** Versions inheriting from each other in a loop (`fr` from `en`, `en` from `fr`): no field to start from. */
export type InheritCycleDiagnostic = DiagnosticOf<'inherit-cycle', 'error', { readonly locales: readonly string[] }>;
/** A required `shared` field a translation leaves out, with no version in the default locale to take it from. */
export type MissingSharedFieldDiagnostic = DiagnosticOf<
  'missing-shared-field',
  'error',
  { readonly field: string; readonly locale: string; readonly key: string }
>;
/** A listed file for which the content source produced no document (often unclosed YAML). */
export type MissingDocumentDiagnostic = DiagnosticOf<'missing-document', 'error', Readonly<Record<string, never>>>;
/** A reference to a term the taxonomy does not declare; the closest terms suggested. */
export type UnknownTaxonomyTermDiagnostic = DiagnosticOf<
  'unknown-taxonomy-term',
  'error',
  { readonly field: string; readonly taxonomy: string; readonly term: string }
>;
/** The same term twice in one reference field. */
export type DuplicateTaxonomyTermDiagnostic = DiagnosticOf<
  'duplicate-taxonomy-term',
  'error',
  { readonly field: string; readonly term: string }
>;
/** A reference field holding neither a term nor a list of terms. */
export type InvalidTaxonomyReferenceDiagnostic = DiagnosticOf<
  'invalid-taxonomy-reference',
  'error',
  { readonly field: string; readonly taxonomy: string }
>;
/** A taxonomy's content file whose name is not one of its terms; the closest terms suggested. */
export type UnknownTermContentDiagnostic = DiagnosticOf<
  'unknown-term-content',
  'error',
  { readonly taxonomy: string; readonly term: string }
>;
/** A draft field that is not a boolean. */
export type InvalidDraftFlagDiagnostic = DiagnosticOf<'invalid-draft-flag', 'error', { readonly field: string }>;
type InvalidMetadataFieldDiagnostic = DiagnosticOf<
  'invalid-metadata-field',
  'error',
  /** A frontmatter field declared as metadata, and what it must hold. */
  {
    readonly field: string;
    readonly expected: 'text' | 'list of texts' | 'robots directives' | 'absolute URL' | 'number';
  }
>;
/** A collection's directory that cannot be listed (missing, unreadable). */
export type CannotListDirectoryDiagnostic = DiagnosticOf<
  'cannot-list-directory',
  'error',
  { readonly directory: string; readonly reason: string },
  null
>;
/**
 * A local image the content references that is not in the app's public folder: in an entry's frontmatter field or
 * body (its `sourcePath`), or in a collection's folder images (`sourcePath` `null`); the closest files suggested.
 */
export type MissingImageDiagnostic = DiagnosticOf<
  'missing-image',
  'error',
  {
    readonly image: string;
    /** The frontmatter field or the declaration (`folderPages.images["news"]`); `null` for the entry's body. */
    readonly field: string | null;
    readonly publicDirectory: string;
  },
  string | null
>;
/** A `testOnly` pattern matching no entry. */
export type UnusedTestOnlyDiagnostic = DiagnosticOf<'unused-test-only', 'warning', { readonly pattern: string }, null>;

/** Every diagnostic that fails a build. */
export type ErrorDiagnostic =
  | InvalidNameDiagnostic
  | NameTooLongDiagnostic
  | UnexpectedDepthDiagnostic
  | UnknownLocaleDiagnostic
  | MissingLocaleDiagnostic
  | IndexForbiddenDiagnostic
  | DuplicateDefaultLocaleDiagnostic
  | KeyCollisionDiagnostic
  | UrlCollisionDiagnostic
  | FolderPageCollisionDiagnostic
  | TermPageCollisionDiagnostic
  | CaseCollisionDiagnostic
  | MissingFrontmatterFieldDiagnostic
  | InvalidFrontmatterFieldDiagnostic
  | InvalidFrontmatterDiagnostic
  | UnknownInheritLocaleDiagnostic
  | MissingInheritSourceDiagnostic
  | InheritCycleDiagnostic
  | MissingSharedFieldDiagnostic
  | UnreadableSourceDiagnostic
  | MissingDocumentDiagnostic
  | UnknownTaxonomyTermDiagnostic
  | DuplicateTaxonomyTermDiagnostic
  | InvalidTaxonomyReferenceDiagnostic
  | UnknownTermContentDiagnostic
  | InvalidDraftFlagDiagnostic
  | InvalidMetadataFieldDiagnostic
  | CannotListDirectoryDiagnostic
  | MissingImageDiagnostic;

/** Every diagnostic reported without failing a build. */
export type WarningDiagnostic =
  UglyIndexDiagnostic | UnusedReservationDiagnostic | UnusedTestOnlyDiagnostic | UnusedFolderImageDiagnostic;

/** Every diagnostic, discriminated by `code`. Severities are fixed per code. */
export type Diagnostic = ErrorDiagnostic | WarningDiagnostic;

/** Every diagnostic code, e.g. `url-collision`. */
export type DiagnosticCode = Diagnostic['code'];

/** Errors about one file (as opposed to declaration-level ones, whose `sourcePath` is `null`). */
export type FileErrorDiagnostic = Extract<ErrorDiagnostic, { readonly sourcePath: string }>;

/**
 * Builds a frozen diagnostic.
 *
 * @param value - The diagnostic.
 * @returns The same, frozen.
 */
export function diagnostic<D extends Diagnostic>(value: D): D {
  Object.freeze(value.data);
  Object.freeze(value.suggestions);

  return Object.freeze(value);
}

/**
 * Code-unit comparison: an order that never depends on the machine's locale.
 *
 * @param a - A string.
 * @param b - Another string.
 * @returns A negative number, zero or a positive number.
 */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Deterministic order of diagnostics: collection, path (declaration-level ones first), code, data.
 *
 * @param a - A diagnostic.
 * @param b - Another diagnostic.
 * @returns The order: collection, path (declaration-level ones first), code, data.
 *
 * @example
 * [...assembly.diagnostics, ...more].sort(compareDiagnostics);
 */
export function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  return (
    compareText(a.collection, b.collection) ||
    compareText(a.sourcePath ?? '', b.sourcePath ?? '') ||
    compareText(a.code, b.code) ||
    compareText(JSON.stringify(a.data), JSON.stringify(b.data))
  );
}
