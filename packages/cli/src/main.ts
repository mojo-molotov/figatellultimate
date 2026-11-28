// prettier-ignore
/**
 * The `figatellultimate` command line: `build`, `check`, `watch`, `search` and `migrate`, dispatched from parsed
 * arguments.
 *
 * Architecture:
 *     argv ──> parseCli ──> loadConfig ──> runOnce (build, check) ──> report ──> exit code
 *                                      ├─> watch: createSerializedRunner(runOnce) on every content change
 *                                      ├─> runSearch: runOnce in production, then built HTML indexed per locale
 *                                      └─> runMigrate: plan, then with --write: moves, config edit, redirects.json
 *
 * Key design decisions:
 *     - figatellultimate drives: it lists paths, analyzes structure, joins the delegated tool's documents, emits and
 * writes; the content source watches its own files.
 *     - Watch runs are serialized: a change aborts the stale run and starts one fresh run, which keeps the last
 * valid output until it succeeds.
 *     - Messages in English only, one template per diagnostic code, with where, why and how to fix; a polished UI
 * in a terminal, plain lines in CI, pipes and with `NO_COLOR`.
 *     - The config is loaded by Node's native type stripping (erasable TypeScript only), validated, and reloaded
 * fresh by one-shot commands.
 *     - Exit codes: 0 no error, 1 content errors, 2 invalid config or usage, 3 unexpected failure.
 *     - The unused messages are scanned by default in build and check, skipped by `--no-unused`: the scan compiles
 *       the app, about half a build, and a project may run it in CI only. Opt-out rather than opt-in, so that a dead
 *       message is warned unless the project chose otherwise.
 *
 * Invariants: the surface a user meets (help, usage errors, exit codes, each command's output, `watch` stopped by a
 * signal) against the built binary in real processes (`surface.cli.test.ts`); the generated output, the messages, the
 * search, the migrations and the unused messages in process (`e2e.test.ts`, `messages-e2e.test.ts`,
 * `search-e2e.test.ts`, `migrate-e2e.test.ts`, `unused-e2e.test.ts` with `--no-unused`, disposable projects); the watch
 * against a build from scratch after bursts of changes, on every OS (`watch.lab.test.ts`, run weekly).
 */
import { watch as watchFile } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import type { Writable } from 'node:stream';

import { isCI, isTTY } from '@clack/prompts';

import { HELP, parseCli, type Command } from './input/args.js';
import { loadConfig, type ConfigProblem, type LoadedConfig } from './input/load-config.js';
import { countDiagnostics, reportLines } from './output/report.js';
import { IMPORTS_MAPPING, runOnce } from './pipeline/run.js';
import { runMigrate } from './pipeline/migrate.js';
import { runSearch, type SearchDiagnostic } from './pipeline/search.js';
import { createSerializedRunner } from './pipeline/serialize.js';
import { createFancyUi, createPlainUi, type Ui } from './output/ui.js';

/**
 * Where the command line prints, and what tests inject.
 *
 */
export interface MainIo {
  readonly stdout: Writable;
  /** Polished terminal UI; default: a TTY outside CI, without `NO_COLOR`. */
  readonly fancy?: boolean;
  readonly cwd?: string;
  /** Stops `watch` (tests); in a terminal, Ctrl+C does. */
  readonly signal?: AbortSignal;
}

/** Exit codes: 0 no error, 1 content errors, 2 invalid config or usage, 3 unexpected failure. */
export const EXIT = { ok: 0, content: 1, usage: 2, unexpected: 3 } as const;

const BUG_TRACKER = 'https://github.com/mojo-molotov/figatellultimate/issues';

const ms = (duration: number): string => `${duration.toFixed(0)} ms`;

function version(): string {
  const manifest: unknown = createRequire(import.meta.url)('../package.json');

  return typeof manifest === 'object' && manifest !== null && 'version' in manifest
    ? String(manifest.version)
    : '0.0.0';
}

function reportConfigProblem(ui: Ui, problem: ConfigProblem): void {
  ui.error(problem.message);

  if (problem.hint !== undefined) ui.info(`${ui.style.cyan('→')} ${problem.hint}`);
}

/** One analysis (and write, for build and watch), reported; resolves to whether content errors were found. */
async function runAndReport(ui: Ui, loaded: LoadedConfig, command: Command, signal?: AbortSignal): Promise<boolean> {
  const write = command.name !== 'check';
  const phase = ui.phase('Analyzing content');
  const result = await runOnce({
    config: loaded.config,
    directory: loaded.directory,
    mode: command.mode,
    write,
    signal,
    // The app's unused messages compile the app: build and check unless `--no-unused`, never each run of watch.
    unused: command.name !== 'watch' && command.unused !== false,
  });
  const { assembly } = result;
  const counts = countDiagnostics(assembly.diagnostics, result.messageDiagnostics);
  const summary = `${String(assembly.entries.length)} entries · ${String(assembly.excluded.length)} excluded (${command.mode}) · ${ms(result.durations.content)}`;

  if (result.hasErrors) phase.failed(summary);
  else phase.done(summary);

  if (assembly.diagnostics.length + result.messageDiagnostics.length > 0) {
    const infos = counts.infos === 0 ? '' : `, ${String(counts.infos)} info`;
    const title = `${String(counts.errors)} error${counts.errors === 1 ? '' : 's'}, ${String(counts.warnings)} warning${counts.warnings === 1 ? '' : 's'}${infos} in ${String(counts.files)} file${counts.files === 1 ? '' : 's'}`;
    const messages = {
      diagnostics: result.messageDiagnostics,
      directory: loaded.config.messages?.directory ?? 'messages',
    };

    ui.block(title, reportLines(assembly.diagnostics, result.directories, ui.style, messages));
  }

  if (result.unused === 'stale')
    ui.info('Unused messages not checked: .figatellultimate/ is older than the messages (run figatellultimate build).');

  if (result.unused === 'no-tsconfig') ui.info('Unused messages not checked: no tsconfig.json beside the config.');

  if (write && result.hasErrors)
    ui.warn('Nothing written: .figatellultimate/ keeps its last valid state (fix the errors above).');

  if (result.writeError !== undefined) ui.error(`Cannot write the generated modules (${result.writeError}).`);

  if (result.stats !== undefined) {
    const { written, unchanged, removed } = result.stats;

    ui.phase('Writing .figatellultimate/').done(
      `${String(written)} written · ${String(unchanged)} unchanged · ${String(removed)} removed · ${ms(result.durations.write)}`,
    );
  }

  if (write && !result.importsMapped) {
    ui.warn(
      `Import the generated modules with #figatellultimate/…: add to package.json "imports": ${JSON.stringify(IMPORTS_MAPPING)}`,
    );
  }

  return result.hasErrors || result.writeError !== undefined;
}

// One-shot commands read the config as it is on disk (fresh): a migration edits it, and callers embedding `main`
// (tests, scripts) may run several commands in one process.
async function runCommand(ui: Ui, command: Command, cwd: string): Promise<number> {
  ui.intro(`figatellultimate ${command.name}`);
  const loaded = await loadConfig(command.config, cwd, true);

  if (!loaded.ok) {
    reportConfigProblem(ui, loaded.errors[0]);
    ui.outro('Invalid configuration');

    return EXIT.usage;
  }

  const failed = await runAndReport(ui, loaded.value, command);

  ui.outro(failed ? ui.style.red('Done with errors') : ui.style.green('Done'));

  return failed ? EXIT.content : EXIT.ok;
}

const SEARCH_ADVICE: Readonly<Record<SearchDiagnostic['code'], string>> = {
  'missing-built-page': 'build the site statically first: every mounted URL prerendered',
  'empty-search-content': "mark the element holding the entry's body with data-pagefind-body",
  'pagefind-error': 'Pagefind refused this page; see its message',
};

/** `figatellultimate search`: fails when the content has errors or a mounted entry cannot be indexed. */
async function runSearchCommand(ui: Ui, command: Command, cwd: string): Promise<number> {
  ui.intro('figatellultimate search');
  const loaded = await loadConfig(command.config, cwd, true);

  if (!loaded.ok) {
    reportConfigProblem(ui, loaded.errors[0]);
    ui.outro('Invalid configuration');

    return EXIT.usage;
  }

  const options = command.search ?? { sites: ['.'], out: 'public/pagefind', localeFolders: false };
  const phase = ui.phase('Indexing the built site');
  const result = await runSearch({ config: loaded.value.config, directory: loaded.value.directory, cwd, ...options });

  if (result.run.hasErrors) {
    phase.failed('The content has errors: run figatellultimate check');
    ui.outro(ui.style.red('Nothing indexed'));

    return EXIT.content;
  }

  const locales = Object.entries(result.indexed ?? {});
  const summary = [
    ...locales.map(([locale, { pages, words }]) => `${locale}: ${String(pages)} pages, ${String(words)} words`),
    ...(result.skipped > 0 ? [`${String(result.skipped)} not searchable`] : []),
  ].join(' · ');

  if (result.diagnostics.length > 0) {
    phase.failed(summary === '' ? 'Nothing indexed' : summary);
    const count = result.diagnostics.length;

    ui.block(
      `${String(count)} page${count === 1 ? '' : 's'} cannot be indexed`,
      result.diagnostics.flatMap((d) => [
        `${ui.style.red('✗')} ${d.url} ${ui.style.dim(`(${d.file})`)} ${d.code}${d.message === undefined ? '' : `: ${d.message}`}`,
        `  ${ui.style.cyan('→')} ${SEARCH_ADVICE[d.code]}`,
      ]),
    );
    ui.outro(ui.style.red('Done with errors'));

    return EXIT.content;
  }

  phase.done(summary === '' ? 'Nothing to index' : summary);
  ui.outro(ui.style.green(`Done: ${options.out}/<locale>/pagefind.js`));

  return EXIT.ok;
}

/** `figatellultimate migrate`: the plan, then, with `--write`, the moves, the config and the redirects. */
async function runMigrateCommand(ui: Ui, command: Command, cwd: string): Promise<number> {
  ui.intro('figatellultimate migrate');
  const loaded = await loadConfig(command.config, cwd, true);

  if (!loaded.ok) {
    reportConfigProblem(ui, loaded.errors[0]);
    ui.outro('Invalid configuration');

    return EXIT.usage;
  }

  const migration = command.migration;

  if (migration === undefined) return EXIT.usage;

  const { target, write } = migration;
  const what =
    target.kind === 'default-locale' ? `default locale → ${target.locale}` : `locale notation → ${target.notation}`;
  const phase = ui.phase(`Planning: ${what}`);
  const result = await runMigrate({ loaded: loaded.value, target, write });
  const { run, plan, moves } = result;

  if (run.hasErrors) {
    phase.failed('The content has errors: fix them first (figatellultimate check), nothing moved');
    ui.outro(ui.style.red('Nothing migrated'));

    return EXIT.content;
  }

  if (plan === undefined) return EXIT.unexpected;

  if (!plan.ok) {
    phase.failed('The migration cannot be done');

    for (const error of plan.errors) {
      if (error.code === 'migration-unknown-locale') {
        ui.error(`"${error.data.locale}" is not a declared locale (${error.data.locales.join(', ')}).`);

        if (error.suggestions.length > 0)
          ui.info(`${ui.style.cyan('→')} did you mean ${error.suggestions.join(' or ')}?`);
      } else {
        ui.error('The migrated content would have errors; nothing is moved:');
        ui.block(
          `${String(error.data.diagnostics.length)} problem(s) after the migration`,
          reportLines(error.data.diagnostics, run.directories, ui.style),
        );
      }
    }

    ui.outro(ui.style.red('Nothing migrated'));

    return EXIT.content;
  }

  if (plan.warnings.length > 0) {
    phase.done('Nothing to do: the project already uses it');
    ui.outro(ui.style.green('Done'));

    return EXIT.ok;
  }

  const { redirects, reused } = plan.value;

  phase.done(
    `${String(moves.length)} file${moves.length === 1 ? '' : 's'} to move · ${String(redirects.length)} URL${redirects.length === 1 ? '' : 's'} to redirect`,
  );
  ui.block(
    'Moves',
    moves.map((m) => `${m.from} ${ui.style.dim('→')} ${m.to}`),
  );
  const edit = result.config;

  if (edit !== undefined) {
    ui.info(
      edit.kind === 'edited'
        ? `Config: defineLocales ${edit.property} → '${edit.value}'`
        : `Config: set ${edit.property}: '${edit.value}' in defineLocales by hand (its value is not a literal).`,
    );
  }

  if (redirects.length > 0)
    ui.block(
      'URLs that change (redirected)',
      redirects.map((r) => `${r.from} ${ui.style.dim('→')} ${r.to}`),
    );

  if (reused.length > 0)
    ui.block(
      'Old URLs now used by another entry (not redirected)',
      reused.map((url) => url),
    );

  if (result.appRoutes.length > 0) {
    ui.warn(
      'These app route folders are named after a locale: they assume which locale is unprefixed. Move or rename them by hand after the migration:',
    );
    ui.block('Locale route folders', [...result.appRoutes]);
  }

  if (result.invalidRedirects === true) {
    ui.error('redirects.json is not a list of { from, to }: fix or remove it, nothing is moved.');
    ui.outro(ui.style.red('Nothing migrated'));

    return EXIT.content;
  }

  if (!write) {
    ui.outro(`Plan only: run again with ${ui.style.bold('--write')} to apply it (all or nothing).`);

    return EXIT.ok;
  }

  const applied = result.applied;

  if (applied === undefined) return EXIT.unexpected;

  if (!applied.ok) {
    const failure = applied.failure;

    if (failure.kind === 'target-exists') {
      ui.error('These targets already exist; nothing is moved:');
      ui.block('Existing files', [...failure.paths]);
    } else {
      ui.error(`A move failed (${failure.reason}).`);
      ui.info(
        failure.restored
          ? 'Every file was put back: nothing changed.'
          : ui.style.red('Some files could not be put back: check the tree.'),
      );
    }

    ui.outro(ui.style.red('Nothing migrated'));

    return EXIT.content;
  }

  ui.phase('Moving files').done(
    `${String(moves.length)} moved · ${String(applied.removed.length)} empty folder${applied.removed.length === 1 ? '' : 's'} removed`,
  );

  if (applied.redirectsFile !== undefined)
    ui.info(
      `Redirects written to ${applied.redirectsFile}, composed with the earlier ones (permanent; toNextRedirects in @figatellultimate/next16).`,
    );

  if (applied.leftovers.length > 0) {
    ui.warn('These files are not entries and stayed where they were; move them if they belong to a moved entry:');
    ui.block('Left in place', [...applied.leftovers]);
  }

  ui.outro(ui.style.green(`Migrated: run ${ui.style.bold('figatellultimate build')}`));

  return EXIT.ok;
}

/**
 * Resolves on Ctrl+C (SIGINT), on SIGTERM (a process manager, a container) or when `signal` aborts; every listener
 * is removed afterwards (no leak across runs).
 */
function untilStopped(signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const stop = (): void => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      signal?.removeEventListener('abort', stop);
      resolve();
    };

    if (signal?.aborted === true) {
      resolve();

      return;
    }

    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    signal?.addEventListener('abort', stop);
  });
}

/**
 * Watches the message modules: any change re-runs (runs always reload them). The folder is the one
 * declared at start; a folder that does not exist yet is not watched until the next start.
 */
function watchMessages(loaded: LoadedConfig, onChange: () => void): { close(): void } | undefined {
  if (loaded.config.messages === undefined) return undefined;

  try {
    const watcher = watchFile(join(loaded.directory, ...loaded.config.messages.directory.split('/')), onChange);

    watcher.on('error', () => undefined);

    return watcher;
  } catch {
    return undefined;
  }
}

async function runWatch(ui: Ui, command: Command, cwd: string, signal?: AbortSignal): Promise<number> {
  ui.intro('figatellultimate watch');
  const initial = await loadConfig(command.config, cwd);

  if (!initial.ok) {
    reportConfigProblem(ui, initial.errors[0]);
    ui.outro('Invalid configuration');

    return EXIT.usage;
  }

  let loaded = initial.value;
  let stopSource: (() => Promise<void>) | undefined;
  let reload = false;

  const watchSource = async (): Promise<boolean> => {
    if (loaded.config.source.watch === undefined) {
      ui.error('This content source cannot watch for changes.');

      return false;
    }

    const watcher = await loaded.config.source.watch(() => {
      runner.trigger();
    });

    stopSource = () => watcher.stop();

    return true;
  };

  // Serialized runs: a newer change aborts the stale run and starts a fresh one; a failing run keeps the last
  // valid output.
  const runner = createSerializedRunner(async (runSignal) => {
    if (reload) {
      reload = false;
      const next = await loadConfig(command.config, cwd, true);

      if (!next.ok) {
        reportConfigProblem(ui, next.errors[0]);

        return;
      }

      await stopSource?.();
      loaded = next.value;
      await watchSource();
      ui.info('Configuration reloaded.');
    }

    try {
      await runAndReport(ui, loaded, command, runSignal);
    } catch (error) {
      if (runSignal.aborted) {
        ui.info(ui.style.dim('Superseded by a newer change.'));

        return;
      }

      ui.error(`Run failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    ui.info(ui.style.dim('Watching for changes… (Ctrl+C to stop)'));
  });

  const configWatcher = watchFile(loaded.path, () => {
    reload = true;
    runner.trigger();
  });
  const messagesWatcher = watchMessages(loaded, () => {
    runner.trigger();
  });

  runner.trigger();

  if (!(await watchSource())) {
    configWatcher.close();
    messagesWatcher?.close();
    await runner.idle();

    return EXIT.usage;
  }

  await untilStopped(signal);
  configWatcher.close();
  messagesWatcher?.close();
  await stopSource?.();
  await runner.idle();
  ui.outro('Stopped watching');

  return EXIT.ok;
}

/**
 * The figatellultimate command line. Resolves to the process exit code; prints only through `io.stdout`.
 *
 * @param argv - The arguments after the program's name.
 * @param io - Where to print, whether the UI is the terminal's, the working directory, and an abort signal for
 *   `watch`.
 * @returns The exit code: `EXIT.ok`, `content` (the content has errors), `usage` (an invalid config or usage) or
 *   `unexpected`. It never throws for a content or usage problem.
 *
 * @example
 * process.exitCode = await main(process.argv.slice(2));
 */
export async function main(argv: readonly string[], io: MainIo = { stdout: process.stdout }): Promise<number> {
  const fancy = io.fancy ?? (isTTY(io.stdout) && !isCI() && process.env['NO_COLOR'] === undefined);
  const ui = fancy ? createFancyUi(io.stdout) : createPlainUi(io.stdout);
  const cwd = io.cwd ?? process.cwd();
  const parsed = parseCli(argv);

  try {
    switch (parsed.kind) {
      case 'help':
        io.stdout.write(`${HELP}\n`);

        return EXIT.ok;
      case 'version':
        io.stdout.write(`${version()}\n`);

        return EXIT.ok;
      case 'usage-error':
        ui.error(parsed.message);

        if (parsed.suggestions.length > 0)
          ui.info(`${ui.style.cyan('→')} did you mean ${parsed.suggestions.join(' or ')}?`);

        // The help itself, after the problem: what the command expects is right there, not one more command away.
        io.stdout.write(`\n${HELP}\n`);

        return EXIT.usage;
      case 'command':
        switch (parsed.command.name) {
          case 'watch':
            return await runWatch(ui, parsed.command, cwd, io.signal);
          case 'search':
            return await runSearchCommand(ui, parsed.command, cwd);
          case 'migrate':
            return await runMigrateCommand(ui, parsed.command, cwd);
          default:
            return await runCommand(ui, parsed.command, cwd);
        }
    }
  } catch (error) {
    ui.error(`Unexpected failure: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    ui.info(`This is a figatellultimate bug, please report it: ${BUG_TRACKER}`);

    return EXIT.unexpected;
  }
}
