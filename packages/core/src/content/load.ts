/**
 * Loading the content through the ports: list, analyze, join, then the checks that need every entry (term page
 * collisions, and the routes when the app splits them).
 *
 * Architecture:
 *     PathLister.list ──> paths ──> analyze (structure, in memory)
 *     ContentSource.documents({ paths }) ──> documents, one by one ──> joinEntry ──> kept entries (streamed)
 *                                                                                └─> summary: diagnostics, exclusions
 *
 * Key design decisions:
 *     - figatellultimate drives: it lists paths and analyzes every file's structure itself, so a file whose frontmatter
 *       fails validation still gets its structural diagnostics.
 *     - Paths and descriptors in memory, documents streamed.
 *     - A translation completing its frontmatter from another version (`inherit.ts`) waits for every document, then
 *       is validated again by the source: only those are held, with every version's frontmatter as written (small).
 *
 * Invariant (`load.test.ts`): core never depends on the delegated tool, tested against fake ports.
 */
import { analyze, type Analysis, type SourceInput } from '../paths/analyze.js';
import {
  compareExcluded,
  idOf,
  joinEntry,
  missingDocument,
  resolveTaxonomies,
  unusedTestOnly,
  type Assembly,
  type Entry,
} from './assemble.js';
import type { Collection } from '../declarations/collection.js';
import { compareDiagnostics, diagnostic, type Diagnostic } from '../shared/diagnostics.js';
import type { Locales } from '../declarations/locales.js';
import type { EntryDescriptor } from '../paths/descriptor.js';
import type { AbortSignalLike, ContentSource, Environment, PathLister, SourceDocument } from './ports.js';
import type { Taxonomy } from '../declarations/taxonomy.js';
import { createUrlBuilder, type UrlBuilder } from '../paths/url.js';
import { INHERIT_FIELD } from '../shared/inherit-field.js';
import { err, ok, type Result } from '../shared/result.js';
import { folderPagesOf } from '../paths/folders.js';
import { routeShadowings } from './routes.js';
import { termPageCollisions, termPagesOf, type TermsOf } from './term-pages.js';
import { completeFrontmatter, type WrittenVersion } from './inherit.js';

/** Thrown when figatellultimate's collections and the delegated tool's do not match (invalid configuration). */
export class InvalidContentSourceError extends Error {
  override readonly name = 'InvalidContentSourceError';
}

/**
 * What loading the content needs: the declarations, the environment, the ports, and an abort signal.
 *
 */
export interface LoadContentInput {
  readonly locales: Locales;
  readonly collections: Readonly<Record<string, Collection>>;
  readonly taxonomies?: Readonly<Record<string, Taxonomy>>;
  readonly environment: Environment;
  readonly urls?: UrlBuilder;
  /** The extensions of a content file (`extensions` of the config); default `.mdx`. */
  readonly extensions?: readonly string[] | undefined;
  readonly paths: PathLister;
  readonly source: ContentSource;
  /** Whether the app has a route per base (`splitRoutes` of the config): every page is then checked to be served. */
  readonly splitRoutes?: boolean | undefined;
  /** Cancels the run at its next checkpoint (after listing, between documents): watch mode supersedes stale runs. */
  readonly signal?: AbortSignalLike | undefined;
}

/** One item of `streamContent`: each kept entry as soon as it is valid, then a final summary. */
export type ContentEvent =
  | { readonly kind: 'entry'; readonly entry: Entry }
  | {
      readonly kind: 'summary';
      readonly analysis: Analysis;
      readonly diagnostics: Assembly['diagnostics'];
      readonly excluded: Assembly['excluded'];
    };

function checkSameCollections(declared: readonly string[], delegated: readonly string[]): void {
  const onlyDeclared = declared.filter((name) => !delegated.includes(name));
  const onlyDelegated = delegated.filter((name) => !declared.includes(name));

  if (onlyDeclared.length > 0 || onlyDelegated.length > 0) {
    throw new InvalidContentSourceError(
      `Collections must be declared on both sides. Only in figatellultimate: ${onlyDeclared.join(', ') || '-'}; ` +
        `only in the content source: ${onlyDelegated.join(', ') || '-'}.`,
    );
  }
}

/** Lists every collection's paths through the port (paths stay in memory: global checks need them all). */
async function listSources(input: LoadContentInput): Promise<{
  sources: SourceInput[];
  /** Listed paths of the collections whose listing succeeded only. */
  listed: Record<string, readonly string[]>;
  diagnostics: Diagnostic[];
}> {
  const { collections, paths, source, signal } = input;
  const directories = await source.directories();

  checkSameCollections(Object.keys(collections), Object.keys(directories));
  const diagnostics: Diagnostic[] = [];
  const listedPaths: Record<string, readonly string[]> = {};
  const listed = await Promise.all(
    Object.entries(directories).map(async ([collection, directory]) => {
      const result = await paths.list(directory, { signal });

      if (result.ok) {
        listedPaths[collection] = result.value;

        return result.value.map((sourcePath): SourceInput => ({ collection, sourcePath }));
      }

      diagnostics.push(
        diagnostic({
          code: 'cannot-list-directory',
          severity: 'error',
          collection,
          sourcePath: null,
          data: { directory, reason: result.errors[0].reason },
          suggestions: [],
        }),
      );

      return [];
    }),
  );

  // Checkpoint after listing, before the delegated tool's (uninterruptible) build.
  signal?.throwIfAborted();

  return { sources: listed.flat(), listed: listedPaths, diagnostics };
}

/**
 * Loads the content as a stream.
 *
 * @param input - The locales, collections, taxonomies, environment, URL strategy, ports and abort signal.
 * @returns Each kept entry as soon as it is valid, then a summary with every diagnostic: paths listed and analyzed
 *   in memory (the global checks need them all), documents joined one by one, so that heavy data is never held all
 *   at once. Aborting rejects with the signal's reason.
 * @throws {InvalidContentSourceError} When figatellultimate's collections and the delegated tool's do not match.
 *
 * @example
 * for await (const event of streamContent(input)) if (event.kind === 'entry') write(event.entry);
 */
export async function* streamContent(input: LoadContentInput): AsyncGenerator<ContentEvent, void, undefined> {
  const { locales, collections, source, signal, environment } = input;
  const taxonomies = input.taxonomies ?? {};

  resolveTaxonomies(collections, taxonomies);

  const listing = await listSources(input);
  const analysis = analyze({
    locales,
    collections,
    sources: listing.sources,
    urls: input.urls,
    extensions: input.extensions,
  });
  const descriptors = new Map<string, EntryDescriptor>(analysis.entries.map((d) => [idOf(d), d]));

  const diagnostics: Diagnostic[] = [...listing.diagnostics, ...analysis.diagnostics];
  const excluded: { entry: SourceInput; reason: 'draft' | 'test-content' }[] = [];
  const seen = new Set<string>();
  const failedInSource = new Set<string>();
  // Every version's frontmatter as written, by collection, key and locale; the documents waiting for them.
  const versions = new Map<string, WrittenVersion>();
  const waiting: { descriptor: EntryDescriptor; document: SourceDocument }[] = [];
  const versionId = (collection: string, key: string, locale: string): string => `${collection}\0${key}\0${locale}`;
  // What term pages need of the kept entries: their place and terms, never their data or body.
  const kept: TermsOf[] = [];
  /** A join's outcome recorded: the entry kept (and returned), excluded, or its errors reported. */
  const settle = (outcome: ReturnType<typeof joinEntry>, document: SourceDocument): Entry | undefined => {
    if (outcome.kind === 'entry') {
      kept.push({ descriptor: outcome.entry.descriptor, terms: outcome.entry.terms });

      return outcome.entry;
    }

    if (outcome.kind === 'excluded') {
      excluded.push({
        entry: { collection: document.collection, sourcePath: document.sourcePath },
        reason: outcome.reason,
      });
    } else diagnostics.push(...outcome.errors);

    return undefined;
  };

  for await (const event of source.documents({ signal, paths: listing.listed })) {
    // Checkpoint between documents: the only place where cancelling saves real work.
    signal?.throwIfAborted();

    if (event.kind === 'diagnostic') {
      const { diagnostic: found } = event;

      diagnostics.push(found);

      if (found.severity === 'error' && found.sourcePath !== null) {
        failedInSource.add(idOf({ collection: found.collection, sourcePath: found.sourcePath }));
      }

      continue;
    }

    const { document } = event;
    const id = idOf(document);

    if (seen.has(id)) throw new TypeError(`streamContent: duplicated document "${document.sourcePath}".`);

    seen.add(id);
    const descriptor = descriptors.get(id);
    const collection = collections[document.collection];

    // A document without a valid structure is dropped: its structural diagnostics are already reported, and its
    // frontmatter's too when the schema rejects it as written (nothing to complete it from without a place).
    if (descriptor === undefined || collection === undefined) {
      if (document.written?.valid === false && source.validate !== undefined) {
        const validated = await source.validate(document.collection, document.sourcePath, document.written.frontmatter);

        if (!validated.ok) diagnostics.push(...validated.errors);
      }

      continue;
    }

    const { written } = document;

    if (written !== undefined) {
      versions.set(versionId(descriptor.collection, descriptor.key, descriptor.locale), {
        descriptor,
        frontmatter: written.frontmatter,
      });

      if (!written.valid || inherits(descriptor, written.frontmatter, collection, locales.default)) {
        waiting.push({ descriptor, document });

        continue;
      }
    }

    const entry = settle(joinEntry(descriptor, document, collection, taxonomies, environment), document);

    if (entry !== undefined) yield { kind: 'entry', entry };
  }

  // The documents completing their frontmatter from another version, now that every version is known.
  for (const { descriptor, document } of waiting) {
    signal?.throwIfAborted();
    const collection = collections[descriptor.collection];

    if (collection === undefined) continue;

    const completed = await completeDocument(input, descriptor, document, collection, (locale) =>
      versions.get(versionId(descriptor.collection, descriptor.key, locale)),
    );

    if (!completed.ok) {
      diagnostics.push(...completed.errors);

      continue;
    }

    const entry = settle(joinEntry(descriptor, completed.value, collection, taxonomies, environment), document);

    if (entry !== undefined) yield { kind: 'entry', entry };
  }

  for (const descriptor of analysis.entries) {
    const id = idOf(descriptor);

    if (!seen.has(id) && !failedInSource.has(id)) diagnostics.push(missingDocument(descriptor));
  }

  diagnostics.push(...unusedTestOnly(collections, analysis.entries));
  diagnostics.push(...pagesDiagnostics(input, taxonomies, kept));

  yield Object.freeze({
    kind: 'summary',
    analysis,
    diagnostics: Object.freeze(diagnostics.sort(compareDiagnostics)),
    excluded: Object.freeze(excluded.sort(compareExcluded)),
  });
}

/**
 * Loads the content.
 *
 * @param input - As `streamContent`'s.
 * @returns The assembly: the kept entries in descriptor order (whatever the source's), the structure of every valid
 *   path, the excluded entries and every diagnostic.
 * @throws {InvalidContentSourceError} When figatellultimate's collections and the delegated tool's do not match.
 *
 * @example
 * const assembly = await loadContent({ locales, collections, taxonomies, environment, paths, source });
 */
export async function loadContent(input: LoadContentInput): Promise<Assembly> {
  const entries: Entry[] = [];
  let summary: Extract<ContentEvent, { kind: 'summary' }> | undefined;

  for await (const event of streamContent(input)) {
    if (event.kind === 'entry') entries.push(event.entry);
    else summary = event;
  }

  // `streamContent` always ends with its summary; an absent one would be a broken invariant of this module.
  if (summary === undefined) throw new Error('streamContent ended without a summary.');

  const order = new Map(summary.analysis.entries.map((descriptor, index) => [idOf(descriptor), index]));
  const rank = (entry: Entry): number => order.get(idOf(entry.descriptor)) ?? 0;

  return Object.freeze({
    entries: Object.freeze(entries.sort((a, b) => rank(a) - rank(b))),
    diagnostics: summary.diagnostics,
    excluded: summary.excluded,
    structure: summary.analysis.entries,
  });
}

/**
 * The checks of every mounted page, among the kept entries: term pages colliding with an entry or a folder page, and,
 * when the app splits its routes, a page another route's prefix takes.
 */
function pagesDiagnostics(
  input: LoadContentInput,
  taxonomies: Readonly<Record<string, Taxonomy>>,
  kept: readonly TermsOf[],
): Diagnostic[] {
  const { locales, collections } = input;
  const urls = input.urls ?? createUrlBuilder(locales);
  const terms = termPagesOf({ locales, collections, taxonomies, urls, entries: kept });
  const split = input.splitRoutes === true;

  if (terms.length === 0 && !split) return [];

  const entries = kept.map((entry) => entry.descriptor);
  const folders = folderPagesOf({ locales, collections, urls, entries });

  return [
    ...termPageCollisions(terms, kept, folders, urls),
    ...(split ? routeShadowings({ collections, taxonomies, entries, folders, terms, urls }) : []),
  ];
}

/** Whether a version takes fields from another one: an `inherit:` marker, or a shared field it leaves out. */
const inherits = (
  descriptor: EntryDescriptor,
  frontmatter: Readonly<Record<string, unknown>>,
  collection: Collection,
  defaultLocale: string,
): boolean =>
  INHERIT_FIELD in frontmatter ||
  (descriptor.locale !== defaultLocale && collection.shared.some((field) => !(field in frontmatter)));

/**
 * A waiting document, its frontmatter completed from the other versions and validated by the source: its data is
 * the validated frontmatter over what the source's transform added (fields the file does not write).
 */
async function completeDocument(
  input: LoadContentInput,
  descriptor: EntryDescriptor,
  document: SourceDocument,
  collection: Collection,
  versionOf: (locale: string) => WrittenVersion | undefined,
): Promise<Result<SourceDocument, Diagnostic>> {
  const written = document.written?.frontmatter ?? {};
  const completed = completeFrontmatter({ descriptor, frontmatter: written }, collection, input.locales, versionOf);

  if (!completed.ok) return completed;

  const { frontmatter, changed, unresolvedShared } = completed.value;

  // Unchanged and valid as written: nothing to validate again (an invalid one never is unchanged here).
  if (!changed && document.written?.valid === true) return ok(document);

  if (input.source.validate === undefined) {
    throw new InvalidContentSourceError(
      'The content source delivers frontmatter to complete (`written`) but cannot validate it (`validate`).',
    );
  }

  const validated = await input.source.validate(document.collection, document.sourcePath, frontmatter);

  if (!validated.ok) {
    const errors = validated.errors.map((error): Diagnostic =>
      error.code === 'missing-frontmatter-field' && unresolvedShared.includes(error.data.field)
        ? diagnostic({
            ...error,
            code: 'missing-shared-field',
            data: { field: error.data.field, locale: input.locales.default, key: descriptor.key },
          })
        : error,
    );

    return err(errors[0] ?? validated.errors[0], ...errors.slice(1));
  }

  const added = Object.entries(document.data).filter(([field]) => !(field in written));

  return ok({ ...document, data: Object.freeze({ ...Object.fromEntries(added), ...validated.value }) });
}
