/**
 * Loading the content through the ports: list, analyze, join, then the checks that need every entry (term page
 * collisions).
 *
 * Architecture:
 *     PathLister.list ──> paths ──> analyze (structure, in memory)
 *     ContentSource.documents({ paths }) ──> documents, one by one ──> joinEntry ──> kept entries (streamed)
 *                                                                               └─> summary: diagnostics,
 * exclusions
 *
 * Key design decisions:
 *     - figatellultimate drives: it lists paths and analyzes every file's structure itself, so a file whose frontmatter
 *       fails validation still gets its structural diagnostics.
 *     - Paths and descriptors in memory, documents streamed.
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
import type { AbortSignalLike, ContentSource, Environment, PathLister } from './ports.js';
import type { Taxonomy } from '../declarations/taxonomy.js';
import { createUrlBuilder, type UrlBuilder } from '../paths/url.js';
import { folderPagesOf } from '../paths/folders.js';
import { termPageCollisions, termPagesOf, type TermsOf } from './term-pages.js';

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
  readonly paths: PathLister;
  readonly source: ContentSource;
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
  const analysis = analyze({ locales, collections, sources: listing.sources, urls: input.urls });
  const descriptors = new Map<string, EntryDescriptor>(analysis.entries.map((d) => [idOf(d), d]));

  const diagnostics: Diagnostic[] = [...listing.diagnostics, ...analysis.diagnostics];
  const excluded: { entry: SourceInput; reason: 'draft' | 'test-content' }[] = [];
  const seen = new Set<string>();
  const failedInSource = new Set<string>();
  // What term pages need of the kept entries: their place and terms, never their data or body.
  const kept: TermsOf[] = [];

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

    // A document without a valid structure is dropped: its structural diagnostics are already reported.
    if (descriptor === undefined || collection === undefined) continue;

    const outcome = joinEntry(descriptor, document, collection, taxonomies, environment);

    if (outcome.kind === 'entry') {
      kept.push({ descriptor: outcome.entry.descriptor, terms: outcome.entry.terms });
      yield { kind: 'entry', entry: outcome.entry };
    } else if (outcome.kind === 'excluded') {
      excluded.push({
        entry: { collection: document.collection, sourcePath: document.sourcePath },
        reason: outcome.reason,
      });
    } else diagnostics.push(...outcome.errors);
  }

  for (const descriptor of analysis.entries) {
    const id = idOf(descriptor);

    if (!seen.has(id) && !failedInSource.has(id)) diagnostics.push(missingDocument(descriptor));
  }

  diagnostics.push(...unusedTestOnly(collections, analysis.entries));
  diagnostics.push(...termPagesDiagnostics(input, taxonomies, kept));

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

/** Term pages colliding with an entry or a folder page, among the kept entries. */
function termPagesDiagnostics(
  input: LoadContentInput,
  taxonomies: Readonly<Record<string, Taxonomy>>,
  kept: readonly TermsOf[],
): Diagnostic[] {
  const { locales, collections } = input;
  const urls = input.urls ?? createUrlBuilder(locales);
  const pages = termPagesOf({ locales, collections, taxonomies, urls, entries: kept });

  if (pages.length === 0) return [];

  const folders = folderPagesOf({ locales, collections, urls, entries: kept.map((entry) => entry.descriptor) });

  return termPageCollisions(pages, kept, folders, urls);
}
