/**
 * The Content Collections adapter: core's `ContentSource` port, backed by Content Collections.
 *
 * Architecture:
 *     figatellultimate (core) lists paths ──> source.documents({ paths }) ──> this adapter
 *         ├─ build: createBuilder(config) ──> events ──> diagnostics (schema issues re-validated, schema-issues.ts)
 *         │                                └─> documents, delivered through withFigatellultimate (config.ts)
 *         └─ watch: one native watcher per root (watcher.ts) ──> reported paths
 *                   planSync(listing, reported, held) (sync-plan.ts) ──> sync file by file, or one rescan
 *
 *     Content Collections owns files, frontmatter parsing, schema validation (any Standard Schema library),
 *     transforms and MDX; figatellultimate owns structure from paths, diagnostics and typed access.
 *
 * Key design decisions:
 *     - figatellultimate drives: it lists paths and analyzes the structure of every file itself, then joins the documents
 *       Content Collections validated by their path. A file whose frontmatter fails validation still gets its
 *       structural diagnostics (with Content Collections driving, it would never reach figatellultimate).
 *     - Documents come through `withFigatellultimate`, never by guessing the names of Content Collections' generated
 *       exports: the adapter stays replaceable, the only package importing Content Collections.
 *     - Schema issues are re-validated on the raw frontmatter: Content Collections flattens them into text.
 *     - In watch mode, a single writer: Content Collections' own watcher is not used. Its watcher syncs and rebuilds
 *       concurrently on every event and its sync is not atomic (bulk changes in new folders lost files, a concurrent
 *       sync duplicated one, deleting an unknown file removed another). Before each build, the reported paths and the
 *       disk's listing are reconciled, one operation at a time, or by one full rescan above 20 operations or when the
 *       config changes.
 *     - Builds are serialized in a process: two sources' documents never mix.
 *
 * Known behaviors of Content Collections 0.15.3:
 *     - A file whose frontmatter cannot be parsed (e.g. unclosed YAML) is dropped silently; figatellultimate still reports
 *       it, as `missing-document`, since it lists paths itself.
 *     - Its validation messages render Standard Schema paths as `[object Object]`, hence the re-validation.
 *
 * Invariants: documents through `withFigatellultimate`, directories relative to the project, structured schema diagnostics
 * with valibot and zod, no absolute path in documents or diagnostics (`*.test.ts`); the sync plan
 * (`sync-plan.test.ts`); the watch against a build from scratch, on every OS (the CLI's watch lab).
 */
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

import { createBuilder } from '@content-collections/core';
import {
  InvalidContentSourceError,
  type ContentSource,
  type FileErrorDiagnostic,
  type SourceDocument,
} from '@figatellultimate/core';

import { exclusive, type Session } from './config.js';
import { frontmatterDiagnostics, hasStandardSchema } from './schema-issues.js';
import { planSync, stateAfterBuild, type CollectionFile, type SyncState } from './sync-plan.js';
import { watchFiles } from './watcher.js';

export { withFigatellultimate } from './config.js';

/** Above this many file operations in one run, one full rescan replaces them (each `sync` rebuilds). */
const RESCAN_THRESHOLD = 20;

const toPosix = (path: string): string => path.split(sep).join('/');

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

/**
 * A Content Collections document as a `SourceDocument`: `_meta` and `content` are not frontmatter data. A document
 * without `_meta.filePath` breaks Content Collections' contract: thrown, not reported.
 */
function toDocument(collection: string, document: unknown): SourceDocument {
  if (!isRecord(document))
    throw new TypeError(`Content Collections delivered a non-object document in "${collection}"`);

  const { _meta, content, ...data } = document;
  const filePath = isRecord(_meta) ? _meta['filePath'] : undefined;

  if (typeof filePath !== 'string')
    throw new TypeError(`Content Collections delivered a document without _meta.filePath in "${collection}"`);

  return { collection, sourcePath: toPosix(filePath), data, body: typeof content === 'string' ? content : '' };
}

/** Where the user's Content Collections config is, and the project it belongs to. */
export interface ContentCollectionsSourceOptions {
  /** Path of the user's Content Collections config. */
  readonly configPath: string;
  /** Root the `PathLister` lists from: directories are reported relative to it. */
  readonly projectRoot: string;
}

/**
 * Core's `ContentSource` port, backed by Content Collections.
 *
 * @param options - The config's path and the project's root.
 * @returns A source that gives each collection's directory, builds programmatically (synced with the listed paths
 *   in watch mode), maps Content Collections' error events to figatellultimate diagnostics, and streams the validated
 *   documents; it watches the collections and the config when asked to.
 * @throws {InvalidContentSourceError} When a collection is not wrapped with `withFigatellultimate` or lives outside the
 *   project: a broken configuration, not an outcome.
 *
 * @example
 * const source = createContentCollectionsSource({ configPath: 'content-collections.ts', projectRoot });
 * const assembly = await loadContent({ locales, collections, environment, paths, source });
 */
export function createContentCollectionsSource(options: ContentCollectionsSourceOptions): ContentSource {
  const configDirectory = dirname(options.configPath);
  let builder: Awaited<ReturnType<typeof createBuilder>> | undefined;
  let directories: Readonly<Record<string, string>> | undefined;
  let collector: { diagnostics: FileErrorDiagnostic[]; pending: Promise<void>[]; invalid: CollectionFile[] } | null =
    null;
  /** What Content Collections holds after the last build; `undefined` until a build ran with listed paths. */
  let state: SyncState | undefined;
  /** Absolute paths the watcher reported since the last run, and whether the Content Collections config changed. */
  const changedPaths = new Set<string>();
  let configChanged = false;

  /** Collection and collection-relative path of a file reported by Content Collections or the watcher. */
  const locate = (filePath: string): CollectionFile | undefined => {
    const absolute = isAbsolute(filePath) ? filePath : join(configDirectory, filePath);

    for (const [collection, directory] of Object.entries(directories ?? {})) {
      const inside = relative(join(options.projectRoot, directory), absolute);

      if (!inside.startsWith('..') && !isAbsolute(inside)) return { collection, sourcePath: toPosix(inside) };
    }

    return undefined;
  };
  const absoluteOf = ({ collection, sourcePath }: CollectionFile): string =>
    join(options.projectRoot, ...(directories?.[collection] ?? '').split('/'), ...sourcePath.split('/'));

  /** Creates the builder (a full scan of the disk) and its event mapping, inside the given session. */
  const open = async (session: Session): Promise<void> => {
    const created = await createBuilder(options.configPath);

    if (session.directories.size === 0) {
      throw new InvalidContentSourceError(
        'No collection is wrapped with withFigatellultimate() in the Content Collections config.',
      );
    }

    directories = Object.fromEntries(
      [...session.directories].map(([name, directory]) => {
        const projectRelative = relative(options.projectRoot, join(configDirectory, directory));

        if (projectRelative.startsWith('..') || isAbsolute(projectRelative)) {
          throw new InvalidContentSourceError(`Collection "${name}" lives outside the project root.`);
        }

        return [name, toPosix(projectRelative)];
      }),
    );
    created.on('transformer:validation-error', ({ collection, file }) => {
      if (collector === null) return;

      const schema = hasStandardSchema(collection) ? collection.schema : undefined;
      // Content Collections types collections loosely (`any` name): narrowed here, at the boundary.
      const name: unknown = collection.name;

      if (schema === undefined || typeof name !== 'string') return;

      collector.invalid.push({ collection: name, sourcePath: toPosix(file.path) });
      collector.pending.push(
        frontmatterDiagnostics(name, toPosix(file.path), schema, file.data).then((diagnostics) => {
          collector?.diagnostics.push(...diagnostics);
        }),
      );
    });

    for (const event of ['collector:parse-error', 'collector:read-error'] as const) {
      created.on(event, ({ filePath, error }) => {
        const location = locate(filePath);

        if (collector === null || location === undefined) return;

        collector.diagnostics.push({
          code: 'unreadable-source',
          severity: 'error',
          ...location,
          data: { message: error.message },
          suggestions: [],
        });
      });
    }

    builder = created;
    // A fresh builder has scanned the disk itself: nothing to reconcile until its first build.
    state = undefined;
  };

  const prepare = (): Promise<void> =>
    exclusive(async (session) => {
      if (builder === undefined) await open(session);
    });

  /**
   * Brings Content Collections in line with the disk before a build, one operation at a time: watcher reports
   * are applied from the disk's state, and the listing catches the events a watcher missed. Bulk changes rescan.
   */
  const reconcile = async (session: Session, listed: Readonly<Record<string, readonly string[]>>): Promise<void> => {
    const changed = [...changedPaths].map(locate).filter((file) => file !== undefined);

    changedPaths.clear();
    const rescan = configChanged;

    configChanged = false;

    if (state === undefined || builder === undefined) return;

    const plan = rescan
      ? ({ kind: 'rescan' } as const)
      : planSync({ ...state, listed, changed, threshold: RESCAN_THRESHOLD });

    if (plan.kind === 'rescan') {
      await open(session);

      return;
    }

    for (const operation of plan.operations) await builder.sync(operation.modification, absoluteOf(operation));
  };

  return {
    async directories() {
      await prepare();

      return directories ?? {};
    },

    async *documents(documentOptions) {
      await prepare();
      // Content Collections cannot interrupt a build: the signal is only checked before starting one.
      // Content Collections 0.15 hands every document of a collection at once (`onSuccess`): this adapter streams
      // what it receives; the memory gain is on figatellultimate's side.
      const { documents, diagnostics } = await exclusive(async (session) => {
        documentOptions?.signal?.throwIfAborted();
        const listed = documentOptions?.paths;

        if (listed !== undefined) await reconcile(session, listed);

        const collected: { diagnostics: FileErrorDiagnostic[]; pending: Promise<void>[]; invalid: CollectionFile[] } = {
          diagnostics: [],
          pending: [],
          invalid: [],
        };

        collector = collected;

        try {
          await builder?.build();
          await Promise.all(collected.pending);
        } finally {
          collector = null;
        }

        const delivered = [...session.documents];
        const held = [
          ...delivered.flatMap(([collection, docs]) => docs.map((doc) => toDocument(collection, doc))),
          ...collected.invalid,
        ];

        if (listed !== undefined) state = stateAfterBuild(state, listed, held);

        return { documents: delivered, diagnostics: collected.diagnostics };
      });

      for (const diagnostic of diagnostics) yield { kind: 'diagnostic', diagnostic } as const;

      for (const [collection, docs] of documents) {
        for (const doc of docs) {
          yield { kind: 'document', document: toDocument(collection, doc) } as const;
        }
      }
    },

    async watch(onChange) {
      await prepare();
      let active = true;
      const roots = Object.values(directories ?? {}).map((directory) =>
        join(options.projectRoot, ...directory.split('/')),
      );
      // figatellultimate's own watcher: Content Collections' one rebuilds concurrently on every event and can
      // lose or duplicate files, and its per-folder handles lock folder renames on Windows; changes are applied by
      // the next run instead.
      const watcher = watchFiles(roots, [options.configPath], (path) => {
        if (!active) return;

        if (path === options.configPath) configChanged = true;
        else changedPaths.add(path);

        onChange();
      });

      return {
        stop: () => {
          active = false;
          watcher.close();

          return Promise.resolve();
        },
      };
    },

    typeSource(collection, fromDirectory) {
      if (directories?.[collection] === undefined) return undefined;

      let specifier = toPosix(relative(fromDirectory, options.configPath));

      if (!specifier.startsWith('.')) specifier = `./${specifier}`;

      return {
        imports: [
          { moduleSpecifier: '@content-collections/core', namedImports: ['GetTypeByName'] },
          { moduleSpecifier: specifier, defaultImport: 'contentCollectionsConfig' },
        ],
        // Type level only: no runtime coupling to Content Collections' generated output.
        type: `Omit<GetTypeByName<typeof contentCollectionsConfig, ${JSON.stringify(collection)}>, '_meta' | 'content'>`,
      };
    },
  };
}
