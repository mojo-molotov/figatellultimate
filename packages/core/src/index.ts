/**
 * The pure core of figatellultimate: locales, collection grammars, path parsing, URLs, the content's required message keys,
 * diagnostics, the ports of the delegated tools, and the `Result` type.
 *
 * What it does: from declared locales and collections and a list of source paths (no file system), `analyze` gives
 * every valid entry descriptor and every diagnostic; `loadContent` lists the paths and joins the delegated tool's
 * documents through the ports. Everything else (reading files, frontmatter, schemas, MDX, watching) is delegated.
 *
 * Key design decisions:
 *     - figatellultimate is a DX layer, not a content engine: structure deduced from paths, actionable diagnostics, narrowed
 *       typed access, content-derived messages; generic content processing stays with a delegated tool, behind a
 *       port, replaceable.
 *     - Pure: no I/O, no Node builtin, never reads `process`; imports no other figatellultimate package and has no
 *       dependency. Expected failures are values (`Result`, diagnostics), never exceptions.
 *     - One rule, one implementation: only `parseEntryPath` turns a path into segments, a key and a route, only the
 *       `UrlBuilder` turns a route into a URL.
 *     - Deterministic and frozen: code-unit ordering, frozen declarations, descriptors, diagnostics and analyses.
 *     - Paths are POSIX and collection-relative everywhere; never an absolute path in a diagnostic.
 *
 * Limitations:
 *     - In free-depth grammars, a first folder that looks like an undeclared locale (`de/x.mdx`) is a regular segment:
 *       the locale position is ambiguous by nature there.
 *     - With an optional locale placed after segments, a segment named like a locale is read as a segment.
 *     - `combine` must receive already-typed results: an inline `ok(x)` passed to it infers its warnings as `unknown`.
 */
export { analyze, hasErrors, type Analysis, type AnalyzeInput, type SourceInput } from './paths/analyze.js';
export { assemble, type Assembly, type AssembleInput, type Entry } from './content/assemble.js';
export { localImageReferences, type ImageReference, type ImageSource } from './content/images.js';
export {
  defineCollection,
  InvalidCollectionError,
  type Collection,
  type CollectionInput,
  type MetadataFields,
  SCHEMA_TYPES,
  type SchemaType,
  type FolderPages,
  type CollectionMessages,
  type FolderPagesInput as CollectionFolderPagesInput,
} from './declarations/collection.js';
export {
  defineConfig,
  parseConfig,
  GENERATED_HEADER,
  InvalidConfigError,
  type FigatellultimateConfig,
  type NavigationItem,
  type MessagesOptions,
} from './config.js';
export type {
  CannotListDirectoryDiagnostic,
  MissingImageDiagnostic,
  CaseCollisionDiagnostic,
  Diagnostic,
  DiagnosticCode,
  DuplicateDefaultLocaleDiagnostic,
  DuplicateTaxonomyTermDiagnostic,
  ErrorDiagnostic,
  FileErrorDiagnostic,
  IndexForbiddenDiagnostic,
  InvalidDraftFlagDiagnostic,
  InvalidFrontmatterDiagnostic,
  UnknownInheritLocaleDiagnostic,
  MissingInheritSourceDiagnostic,
  InheritCycleDiagnostic,
  MissingSharedFieldDiagnostic,
  InvalidFrontmatterFieldDiagnostic,
  InvalidNameDiagnostic,
  InvalidTaxonomyReferenceDiagnostic,
  KeyCollisionDiagnostic,
  MissingDocumentDiagnostic,
  MissingFrontmatterFieldDiagnostic,
  MissingLocaleDiagnostic,
  NameTooLongDiagnostic,
  TermPageCollisionDiagnostic,
  UglyIndexDiagnostic,
  UnexpectedDepthDiagnostic,
  UnknownLocaleDiagnostic,
  UnknownTaxonomyTermDiagnostic,
  UnknownTermContentDiagnostic,
  UnreadableSourceDiagnostic,
  UnusedFolderImageDiagnostic,
  FolderImageFallbackDiagnostic,
  InfoDiagnostic,
  UnusedReservationDiagnostic,
  UnusedTestOnlyDiagnostic,
  UrlCollisionDiagnostic,
  WarningDiagnostic,
} from './shared/diagnostics.js';
export {
  join,
  locale,
  rest,
  segment,
  slug,
  type GrammarPart,
  type JoinPart,
  type LocalePart,
  type RestPart,
  type RouteNames,
  type RoutePart,
  type SegmentNames,
  type SegmentPart,
  type SlugPart,
} from './declarations/grammar.js';
export {
  InvalidContentSourceError,
  loadContent,
  streamContent,
  type ContentEvent,
  type LoadContentInput,
} from './content/load.js';
export {
  defineLocales,
  InvalidLocalesError,
  type LocaleInfo,
  type LocaleInfoInput,
  type LocaleNotation,
  type Locales,
  type LocalesInput,
} from './declarations/locales.js';
export { contentMessageTree, type MessageNode, type MessageTree } from './messages/content-tree.js';
export type { EntryDescriptor } from './paths/descriptor.js';
export { folderPagesOf, type FolderPage, type FolderPagesInput } from './paths/folders.js';
export { termPagesOf, type TermPage, type TermPagesInput, type TermsOf } from './content/term-pages.js';
export { parseEntryPath } from './paths/parse.js';
export {
  entryPathOf,
  planMigration,
  type EntryPathParts,
  type MigrationDiagnostic,
  type MigrationInput,
  type MigrationMove,
  type MigrationPlan,
  type MigrationRedirect,
  type MigrationTarget,
  type MigrationWarning,
} from './paths/migration.js';
export type {
  AbortSignalLike,
  ContentSource,
  Environment,
  ListError,
  PathLister,
  SourceDocument,
  SourceEvent,
  TypeImport,
  TypeSource,
} from './content/ports.js';
export {
  andThen,
  combine,
  err,
  map,
  mapErr,
  ok,
  type Err,
  type ErrorOf,
  type Ok,
  type Result,
  type ValuesOf,
  type WarningOf,
} from './shared/result.js';
export { suggest } from './shared/suggest.js';
export { compareDiagnostics } from './shared/diagnostics.js';
export {
  defineTaxonomy,
  InvalidTaxonomyError,
  type Taxonomy,
  type TaxonomyOptions,
  type TermPages,
} from './declarations/taxonomy.js';
export { createUrlBuilder, InvalidUrlOptionsError, type UrlBuilder, type UrlOptions } from './paths/url.js';
