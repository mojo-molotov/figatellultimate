/**
 * `figatellu migrate default-locale <locale>` and `figatellu migrate notation <implicit|explicit>`: the plan, then
 * with `--write` the moves, the config edit and the redirect table.
 *
 * Key design decisions:
 *     - A plan first: without `--write`, nothing is written; the author sees the moves, the config change and the
 * URLs that change.
 *     - All or nothing: every file is renamed to a temporary name, then to its target (swaps and chains never
 * overwrite); any failure puts every file back.
 *     - The config is edited through its AST (only the literal located, the text spliced, every other byte kept); a
 * value that is not a literal is left to the author.
 *     - `redirects.json` composes with the earlier table: an old link reaches its page in one hop, never a chain or
 * a loop.
 *     - The app's route folders named after a locale are pointed out, never touched.
 *
 * Invariants (`migrate.test.ts` with injected failures, `migrate-e2e.test.ts`): nothing written without `--write`;
 * a failed rename restores the tree; there and back gives the original files byte for byte.
 */
import * as nodeFs from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';

import {
  planMigration,
  type MigrationDiagnostic,
  type MigrationRedirect,
  type MigrationPlan,
  type MigrationTarget,
  type MigrationWarning,
} from '@figatellu/core';
import { Node, Project, SyntaxKind } from 'ts-morph';

import type { LoadedConfig } from '../input/load-config.js';
import { runOnce, type RunResult } from './run.js';

/** The file system operations a migration needs: injectable, so that an all-or-nothing failure can be tested. */
export interface MigrationFs {
  readonly rename: (from: string, to: string) => Promise<void>;
  readonly mkdir: (path: string) => Promise<void>;
  readonly rmdir: (path: string) => Promise<void>;
  /** The folder's entries, files told apart from folders. */
  readonly readdir: (path: string) => Promise<readonly { readonly name: string; readonly file: boolean }[]>;
  readonly exists: (path: string) => Promise<boolean>;
  readonly readFile: (path: string) => Promise<string>;
  readonly writeFile: (path: string, contents: string) => Promise<void>;
}

const NODE_MIGRATION_FS: MigrationFs = {
  rename: (from, to) => nodeFs.rename(from, to),
  mkdir: async (path) => {
    await nodeFs.mkdir(path, { recursive: true });
  },
  rmdir: (path) => nodeFs.rmdir(path),
  readdir: async (path) =>
    (await nodeFs.readdir(path, { withFileTypes: true })).map((entry) => ({ name: entry.name, file: entry.isFile() })),
  exists: (path) =>
    nodeFs.access(path).then(
      () => true,
      () => false,
    ),
  readFile: (path) => nodeFs.readFile(path, 'utf8'),
  writeFile: (path, contents) => nodeFs.writeFile(path, contents, 'utf8'),
};

/** A move, its paths relative to the project root (POSIX), as shown to the author. */
export interface ProjectMove {
  readonly from: string;
  readonly to: string;
}

/**
 * The edited config, or why the value was left to the author (not a literal).
 *
 */
export type ConfigEdit =
  | {
      readonly kind: 'edited';
      readonly text: string;
      readonly property: 'default' | 'notation';
      readonly value: string;
    }
  | { readonly kind: 'not-literal'; readonly property: 'default' | 'notation'; readonly value: string };

/**
 * The config with `default` or `notation` changed inside `defineLocales({ … })`. ts-morph only locates the
 * literal; the text is spliced, so every other byte is kept. A value that is not a literal is left to the author.
 *
 * @param text - The config's source.
 * @param target - The new default locale or notation.
 * @returns The edited source, or the reason it was not edited.
 */
export function editLocalesConfig(text: string, target: MigrationTarget): ConfigEdit {
  const property = target.kind === 'default-locale' ? 'default' : 'notation';
  const value = target.kind === 'default-locale' ? target.locale : target.notation;
  const notLiteral: ConfigEdit = { kind: 'not-literal', property, value };
  const file = new Project({ useInMemoryFileSystem: true }).createSourceFile('figatellu.config.ts', text);
  const call = file
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((node) => node.getExpression().getText() === 'defineLocales');
  const argument = call?.getArguments()[0];

  if (argument === undefined || !Node.isObjectLiteralExpression(argument)) return notLiteral;

  const assignments = argument.getProperties().filter(Node.isPropertyAssignment);
  const literal = (name: string) => {
    const initializer = assignments.find((p) => p.getName() === name)?.getInitializer();

    return initializer !== undefined && Node.isStringLiteral(initializer) ? initializer : undefined;
  };
  const quote = literal('default')?.getText().charAt(0) ?? "'";
  const existing = assignments.find((p) => p.getName() === property);

  if (existing !== undefined) {
    const initializer = literal(property);

    if (initializer === undefined) return notLiteral;

    const edited = `${text.slice(0, initializer.getStart())}${quote}${value}${quote}${text.slice(initializer.getEnd())}`;

    return { kind: 'edited', text: edited, property, value };
  }

  // No `notation` yet (implicit by default): added after the last property.
  const last = argument.getProperties().at(-1);

  if (property !== 'notation' || last === undefined) return notLiteral;

  const edited = `${text.slice(0, last.getEnd())}, notation: ${quote}${value}${quote}${text.slice(last.getEnd())}`;

  return { kind: 'edited', text: edited, property, value };
}

/**
 * Why the moves were rolled back.
 *
 */
export type ApplyFailure =
  | { readonly kind: 'target-exists'; readonly paths: readonly string[] }
  | { readonly kind: 'failed'; readonly reason: string; readonly restored: boolean };

/**
 * Moves every file, all or nothing: each one is renamed to a temporary name next to it, then to its target
 * (so swaps and chains never overwrite); any failure renames every file back. Then removes the folders left empty.
 *
 * @param root - The project's root.
 * @param moves - The moves, project-relative.
 * @param fs - The file system operations (injectable).
 * @returns Done, or the failure after every file was put back.
 */
export async function applyMoves(
  root: string,
  moves: readonly ProjectMove[],
  fs: MigrationFs,
): Promise<
  { readonly ok: true; readonly removed: readonly string[] } | { readonly ok: false; readonly failure: ApplyFailure }
> {
  const abs = (path: string): string => join(root, ...path.split('/'));
  const sources = new Set(moves.map((m) => m.from));
  const occupied: string[] = [];

  for (const move of moves) if (!sources.has(move.to) && (await fs.exists(abs(move.to)))) occupied.push(move.to);

  if (occupied.length > 0) return { ok: false, failure: { kind: 'target-exists', paths: occupied } };

  const temporary = (index: number, move: ProjectMove): string =>
    `${abs(move.from)}.figatellu-migrate-${String(index)}`;
  const parked: number[] = [];
  const placed: number[] = [];

  try {
    for (const [index, move] of moves.entries()) {
      await fs.rename(abs(move.from), temporary(index, move));
      parked.push(index);
    }

    for (const [index, move] of moves.entries()) {
      await fs.mkdir(dirname(abs(move.to)));
      await fs.rename(temporary(index, move), abs(move.to));
      placed.push(index);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message.replaceAll(root, '.') : String(error);
    let restored = true;

    try {
      for (const index of placed.reverse()) {
        const move = moves[index];

        if (move !== undefined) await fs.rename(abs(move.to), temporary(index, move));
      }

      for (const index of parked.reverse()) {
        const move = moves[index];

        if (move !== undefined) await fs.rename(temporary(index, move), abs(move.from));
      }
    } catch {
      restored = false;
    }

    return { ok: false, failure: { kind: 'failed', reason, restored } };
  }

  // Folders a move emptied, deepest first, up to (never including) the project root.
  const removed: string[] = [];
  const folders = [...new Set(moves.map((m) => posix.dirname(m.from)))].sort(
    (a, b) => b.split('/').length - a.split('/').length,
  );

  for (const start of folders) {
    for (let folder = start; folder !== '.' && folder !== ''; folder = posix.dirname(folder)) {
      if (!(await fs.exists(abs(folder))) || (await fs.readdir(abs(folder))).length > 0) break;

      await fs.rmdir(abs(folder));
      removed.push(folder);
    }
  }

  return { ok: true, removed };
}

/**
 * What a migration needs: the config, the target, whether to write, and where.
 *
 */
export interface MigrateInput {
  readonly loaded: LoadedConfig;
  readonly target: MigrationTarget;
  readonly write: boolean;
  readonly fs?: MigrationFs | undefined;
}

/**
 * What a migration found and did: the plan, the diagnostics, and the writes.
 *
 */
export interface MigrateResult {
  readonly run: RunResult;
  readonly plan?:
    | { readonly ok: true; readonly value: MigrationPlan; readonly warnings: readonly MigrationWarning[] }
    | { readonly ok: false; readonly errors: readonly MigrationDiagnostic[] }
    | undefined;
  /** The moves, relative to the project root. */
  readonly moves: readonly ProjectMove[];
  readonly config?: ConfigEdit | undefined;
  /** `redirects.json` exists but is not a list of `{ from, to }`: `--write` refuses. */
  readonly invalidRedirects?: boolean | undefined;
  /** The app's route folders named after a declared locale: they depend on the default locale. */
  readonly appRoutes: readonly string[];
  /** With `--write`: what happened. */
  readonly applied?:
    | {
        readonly ok: true;
        readonly removed: readonly string[];
        readonly leftovers: readonly string[];
        readonly redirectsFile?: string | undefined;
      }
    | { readonly ok: false; readonly failure: ApplyFailure }
    | undefined;
}

const REDIRECTS_FILE = 'redirects.json';

/**
 * `figatellu migrate`: the content analyzed in development (drafts and test content move too), the plan,
 * and with `write`, the moves, the config edit and `redirects.json`. Never writes on content errors or a failed plan.
 *
 * @param input - The config, the target, whether to write, the project's folder and its file system.
 * @returns The plan, and with `write`, what was written.
 */
export async function runMigrate(input: MigrateInput): Promise<MigrateResult> {
  const { loaded, target, write } = input;
  const fs = input.fs ?? NODE_MIGRATION_FS;
  const { config, directory } = loaded;
  const run = await runOnce({ config, directory, mode: 'development', write: false });

  if (run.hasErrors) return { run, moves: [], appRoutes: [] };

  const previous = await readRedirects(join(directory, REDIRECTS_FILE), fs);
  const plan = planMigration({
    locales: config.locales,
    collections: config.collections,
    urls: config.urls,
    entries: run.assembly.structure,
    target,
    previous: previous === 'invalid' ? [] : previous,
  });

  if (!plan.ok) return { run, plan, moves: [], appRoutes: [] };

  const appRoutes =
    target.kind === 'default-locale' ? await localeRouteFolders(directory, config.locales.list, fs) : [];
  const invalidRedirects = previous === 'invalid';
  const moves = plan.value.moves.map((m) => {
    const base = run.directories[m.collection] ?? m.collection;

    return { from: posix.join(base, m.from), to: posix.join(base, m.to) };
  });
  const configText = await fs.readFile(loaded.path);
  const edit =
    plan.value.moves.length === 0 && plan.warnings.length > 0 ? undefined : editLocalesConfig(configText, target);
  const planned = { run, plan, moves, config: edit, appRoutes, invalidRedirects };

  if (!write || edit === undefined || invalidRedirects) return planned;

  const applied = await applyMoves(directory, moves, fs);

  if (!applied.ok) return { ...planned, applied };

  if (edit.kind === 'edited') await fs.writeFile(loaded.path, edit.text);

  let redirectsFile: string | undefined;

  // The composed table; an existing file is kept in step even when it ends up empty.
  if (plan.value.table.length > 0 || previous !== undefined) {
    redirectsFile = REDIRECTS_FILE;
    await fs.writeFile(join(directory, REDIRECTS_FILE), `${JSON.stringify(plan.value.table, null, 2)}\n`);
  }

  // Files that are not entries, left in folders the moves emptied of every entry (images next to an entry…).
  const leftovers: string[] = [];
  const emptied = new Set(moves.map((m) => posix.dirname(m.from)));

  for (const folder of emptied) {
    if (applied.removed.includes(folder) || !(await fs.exists(join(directory, ...folder.split('/'))))) continue;

    const files = (await fs.readdir(join(directory, ...folder.split('/')))).filter((entry) => entry.file);

    if (!files.some((entry) => entry.name.endsWith('.mdx')))
      leftovers.push(...files.map((entry) => `${folder}/${entry.name}`));
  }

  return { ...planned, applied: { ok: true, removed: applied.removed, leftovers: leftovers.sort(), redirectsFile } };
}

/** The existing redirect table: `undefined` without a file, `'invalid'` when it is not a list of `{ from, to }`. */
async function readRedirects(
  path: string,
  fs: MigrationFs,
): Promise<readonly MigrationRedirect[] | 'invalid' | undefined> {
  if (!(await fs.exists(path))) return undefined;

  let parsed: unknown;

  try {
    parsed = JSON.parse(await fs.readFile(path));
  } catch {
    return 'invalid';
  }

  if (!Array.isArray(parsed)) return 'invalid';

  // Widened from JSON's `any[]`: each item is checked below.
  const items: readonly unknown[] = parsed;
  const table: MigrationRedirect[] = [];

  for (const item of items) {
    if (typeof item !== 'object' || item === null || !('from' in item) || !('to' in item)) return 'invalid';

    const { from, to } = item;

    if (typeof from !== 'string' || typeof to !== 'string') return 'invalid';

    table.push({ from, to });
  }

  return table;
}

/** Route folders of a Next app named after a declared locale, relative to the project root. */
async function localeRouteFolders(directory: string, locales: readonly string[], fs: MigrationFs): Promise<string[]> {
  const found: string[] = [];

  for (const app of ['app', 'src/app'])
    for (const locale of locales)
      if (await fs.exists(join(directory, ...app.split('/'), locale))) found.push(`${app}/${locale}`);

  return found;
}
