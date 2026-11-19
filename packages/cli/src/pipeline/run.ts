/**
 * One run: the content (paths listed, structure analyzed, documents joined), the messages, then the code generation
 * and the atomic writes when everything is valid.
 *
 * Invariants (`e2e.test.ts`): a run with errors or an aborted run writes nothing; a second run with no change
 * rewrites nothing; no absolute path in the output.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { emit } from '@figatellultimate/codegen';
import {
  contentMessageTree,
  createUrlBuilder,
  loadContent,
  type Assembly,
  type Environment,
  type FigatellultimateConfig,
} from '@figatellultimate/core';
import {
  analyzeMessages,
  checkNavigationLabels,
  type MessageDiagnostic,
  type MessagesModel,
} from '@figatellultimate/messages';
import { createNodeFileWriter, createNodePathLister, type CommitStats } from '@figatellultimate/fs-node';

import type { Mode } from '../input/args.js';
import { loadMessageModules } from '../input/load-messages.js';

/**
 * What one run needs: the config, its folder, the mode, whether to write, and an abort signal.
 *
 */
export interface RunInput {
  readonly config: FigatellultimateConfig;
  /** Absolute project root: the config file's directory. */
  readonly directory: string;
  readonly mode: Mode;
  /** `false` for `check`: analyze only. */
  readonly write: boolean;
  /** Watch mode: a newer change aborts this run; an aborted run never writes. */
  readonly signal?: AbortSignal | undefined;
}

/**
 * What one run found and did: the assembly, the diagnostics, the messages and the writes.
 *
 */
export interface RunResult {
  readonly assembly: Assembly;
  readonly directories: Readonly<Record<string, string>>;
  /** Message diagnostics, when the config declares messages. */
  readonly messageDiagnostics: readonly MessageDiagnostic[];
  readonly hasErrors: boolean;
  /** `undefined` when nothing was written (check, or errors: the last valid state is kept). */
  readonly stats?: CommitStats | undefined;
  readonly writeError?: string | undefined;
  /** Whether the app's package.json maps `#figatellultimate/*`. */
  readonly importsMapped: boolean;
  readonly durations: { readonly content: number; readonly write: number };
}

/** The `imports` mapping an app needs: Node runs the JavaScript, TypeScript reads the sibling `index.d.ts`. */
export const IMPORTS_MAPPING = { '#figatellultimate/*': './.figatellultimate/*/index.js' } as const;

const environmentOf = (mode: Mode): Environment =>
  mode === 'production' ? { drafts: 'exclude', testContent: 'exclude' } : { drafts: 'include', testContent: 'include' };

async function hasImportsMapping(directory: string): Promise<boolean> {
  try {
    const manifest: unknown = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));

    if (typeof manifest !== 'object' || manifest === null || !('imports' in manifest)) return false;

    const imports: unknown = manifest.imports;

    return typeof imports === 'object' && imports !== null && '#figatellultimate/*' in imports;
  } catch {
    return false;
  }
}

/** The messages: required keys from every structurally valid entry, then each locale's module. */
async function analyzeMessagesOf(
  config: FigatellultimateConfig,
  directory: string,
  assembly: Assembly,
): Promise<{ model: MessagesModel; diagnostics: readonly MessageDiagnostic[] } | undefined> {
  if (config.messages === undefined) return undefined;

  const tree = contentMessageTree({
    collections: config.collections,
    taxonomies: config.taxonomies ?? {},
    entries: assembly.structure,
  });
  const loaded = await loadMessageModules(
    join(directory, ...config.messages.directory.split('/')),
    config.messages.schema,
  );
  const analysis = analyzeMessages({ locales: config.locales, tree, modules: loaded.modules });
  // An unreadable module is reported by the loader; the analysis then sees it as missing: keep only the loader's.
  const unreadable = new Set(loaded.diagnostics.map((d) => d.file));
  const diagnostics = [
    ...loaded.diagnostics,
    ...analysis.diagnostics.filter((d) => !(d.code === 'missing-message-module' && unreadable.has(d.file))),
    ...checkNavigationLabels(analysis.model, config.navigation ?? [], config.locales.default),
  ].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));

  return { model: analysis.model, diagnostics };
}

/**
 * One run: content (structure + delegated documents), then codegen and atomic writes when everything is valid.
 *
 * @param input - The config, its folder, the mode, whether to write, and an abort signal.
 * @returns The run's result; an aborted run or a run with errors writes nothing, so `.figatellultimate/` keeps its last
 *   valid state.
 */
export async function runOnce(input: RunInput): Promise<RunResult> {
  const { config, directory, mode, write, signal } = input;
  const started = performance.now();
  const directories = await config.source.directories();
  const assembly = await loadContent({
    locales: config.locales,
    collections: config.collections,
    ...(config.taxonomies === undefined ? {} : { taxonomies: config.taxonomies }),
    environment: environmentOf(mode),
    urls: createUrlBuilder(config.locales, config.urls),
    paths: createNodePathLister(directory),
    source: config.source,
    signal,
  });
  const messages = await analyzeMessagesOf(config, directory, assembly);
  const contentDone = performance.now();
  const messageDiagnostics = messages?.diagnostics ?? [];
  const hasErrors = [...assembly.diagnostics, ...messageDiagnostics].some((d) => d.severity === 'error');
  const importsMapped = await hasImportsMapping(directory);

  if (!write || hasErrors) {
    return {
      assembly,
      directories,
      messageDiagnostics,
      hasErrors,
      importsMapped,
      durations: { content: contentDone - started, write: 0 },
    };
  }

  // Last checkpoint: a superseded run must not overwrite the output with a stale generation.
  signal?.throwIfAborted();
  const outputDirectory = join(directory, ...(config.output ?? '.figatellultimate').split('/'));
  const committed = await createNodeFileWriter(outputDirectory).commit(
    emit({ config, assembly, outputDirectory, messages: messages?.model }),
  );

  return {
    assembly,
    directories,
    messageDiagnostics,
    hasErrors,
    importsMapped,
    stats: committed.ok ? committed.value : undefined,
    writeError: committed.ok ? undefined : committed.errors[0].reason,
    durations: { content: contentDone - started, write: performance.now() - contentDone },
  };
}
