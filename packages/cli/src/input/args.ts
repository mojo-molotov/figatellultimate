/**
 * Argument parsing with `node:util` `parseArgs`: every combination of arguments gives a command or a usage error
 * with "did you mean" suggestions, never a crash (`args.test.ts`).
 */
import { parseArgs } from 'node:util';

import { suggest, type MigrationTarget } from '@figatellu/core';

/**
 * Which content a run keeps: `production` excludes drafts and test content, `development` keeps them.
 *
 */
export type Mode = 'production' | 'development';

const COMMANDS = ['build', 'check', 'watch', 'search', 'migrate'] as const;
const MIGRATIONS = ['default-locale', 'notation'] as const;
const NOTATIONS = ['implicit', 'explicit'] as const;

type CommandName = (typeof COMMANDS)[number];

/**
 * A parsed command: its name, the config's path, the mode, and its own options.
 *
 */
export interface Command {
  readonly name: CommandName;
  /** Config file path, as given (resolved against the working directory by the caller). */
  readonly config: string;
  /** Derives the injected environment: drafts and test content are excluded in production. */
  readonly mode: Mode;
  /** `search` only: the framework's built HTML, and where to write the Pagefind bundles. */
  readonly search?: { readonly site: string; readonly out: string; readonly localeFolders: boolean } | undefined;
  /** `migrate` only: what to migrate to, and whether to apply the plan. */
  readonly migration?: { readonly target: MigrationTarget; readonly write: boolean } | undefined;
}

/** A usage problem: always a value, never a crash. */
interface UsageError {
  readonly kind: 'usage-error';
  readonly message: string;
  readonly suggestions: readonly string[];
}

/** What the arguments ask for: a command, the help, the version, or a usage error to print before the help. */
export type ParsedArgs =
  | { readonly kind: 'command'; readonly command: Command }
  | { readonly kind: 'help' }
  | { readonly kind: 'version' }
  | UsageError;

const OPTIONS = {
  config: { type: 'string', short: 'c' },
  mode: { type: 'string', short: 'm' },
  site: { type: 'string' },
  out: { type: 'string' },
  'locale-folders': { type: 'boolean' },
  write: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const;

const MODES: readonly Mode[] = ['production', 'development'];
const DEFAULT_CONFIG = 'figatellu.config.ts';
const DEFAULT_SEARCH_OUT = 'public/pagefind';

const usageError = (message: string, suggestions: readonly string[] = []): UsageError => ({
  kind: 'usage-error',
  message,
  suggestions,
});

const isCommand = (value: string): value is CommandName => COMMANDS.some((name) => name === value);
const isMode = (value: string): value is Mode => MODES.some((mode) => mode === value);

/**
 * Parses the CLI arguments: every combination gives a value, never an exception.
 *
 * @param argv - The arguments after the program's name.
 * @returns A command, a help request, or a usage error with suggestions (an unknown option or command, a missing
 *   value).
 */
export function parseCli(argv: readonly string[]): ParsedArgs {
  let parsed: ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true; strict: true }>>;

  try {
    parsed = parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const option = /'(-{1,2}[^' ]+)/.exec(message)?.[1];
    const names = Object.keys(OPTIONS).map((name) => `--${name}`);

    return usageError(
      option === undefined ? message : `Unknown or malformed option ${option}.`,
      option === undefined ? [] : suggest(option.replace(/=.*$/, ''), names),
    );
  }

  const { values, positionals } = parsed;

  if (values.help === true) return { kind: 'help' };

  if (values.version === true) return { kind: 'version' };

  const [name, ...extra] = positionals;

  if (name === undefined) return usageError('Missing command.', COMMANDS);

  if (!isCommand(name)) return usageError(`Unknown command "${name}".`, suggest(name, COMMANDS));

  if (name !== 'migrate' && extra.length > 0) return usageError(`Unexpected argument "${extra.join(' ')}".`);

  if (name !== 'migrate' && values.write === true) return usageError('The --write option only applies to migrate.');

  const mode = values.mode ?? (name === 'watch' ? 'development' : 'production');

  if (!isMode(mode)) return usageError(`Unknown mode "${mode}".`, suggest(mode, MODES));

  const config = values.config ?? DEFAULT_CONFIG;

  if (config.trim() === '') return usageError('The --config option needs a path.');

  if (name === 'migrate') {
    const target = migrationTarget(extra);

    if ('message' in target) return target;

    return { kind: 'command', command: { name, config, mode, migration: { target, write: values.write === true } } };
  }

  if (name !== 'search') {
    const misplaced =
      values.site !== undefined
        ? '--site'
        : values.out !== undefined
          ? '--out'
          : values['locale-folders'] === true
            ? '--locale-folders'
            : undefined;

    if (misplaced !== undefined) return usageError(`The ${misplaced} option only applies to search.`);

    return { kind: 'command', command: { name, config, mode } };
  }

  const site = values.site?.trim() ?? '';

  if (site === '') return usageError('The search command needs --site <built HTML directory>, e.g. .next/server/app.');

  const out = values.out ?? DEFAULT_SEARCH_OUT;

  if (out.trim() === '') return usageError('The --out option needs a path.');

  const localeFolders = values['locale-folders'] === true;

  return { kind: 'command', command: { name, config, mode, search: { site, out, localeFolders } } };
}

/** `default-locale <locale>` or `notation <implicit|explicit>`: a target, or a usage error with suggestions. */
function migrationTarget(args: readonly string[]): MigrationTarget | UsageError {
  const [kind, value, ...rest] = args;

  if (kind === undefined)
    return usageError('Missing migration: default-locale <locale> or notation <implicit|explicit>.', MIGRATIONS);

  if (kind !== 'default-locale' && kind !== 'notation')
    return usageError(`Unknown migration "${kind}".`, suggest(kind, MIGRATIONS));

  if (rest.length > 0) return usageError(`Unexpected argument "${rest.join(' ')}".`);

  if (kind === 'default-locale') {
    if (value === undefined || value.trim() === '')
      return usageError('The default-locale migration needs a locale, e.g. en.');

    return { kind, locale: value };
  }

  if (value !== 'implicit' && value !== 'explicit')
    return usageError(
      value === undefined ? 'The notation migration needs implicit or explicit.' : `Unknown notation "${value}".`,
      value === undefined ? NOTATIONS : suggest(value, NOTATIONS),
    );

  return { kind, notation: value };
}

/** The help text: every command and option, printed by `--help` and after a usage error. */
export const HELP: string = `Usage: figatellu <command> [options]

Commands:
  build    Analyze the content and write the generated modules (.figatellu/)
  check    Analyze the content without writing anything
  watch    Build, then rebuild on every content or config change
  search   Index the built site with Pagefind, one bundle per locale (after the framework's build)
  migrate  default-locale <locale> | notation <implicit|explicit>: print the plan; --write applies it

Options:
  -c, --config <path>   Config file (default: ${DEFAULT_CONFIG})
  -m, --mode <mode>     production (default for build and check) or development (default for watch):
                        production excludes drafts and test content
      --site <path>     search: the built HTML (e.g. .next/server/app)
      --out <path>      search: where to write the bundles (default: ${DEFAULT_SEARCH_OUT})
      --locale-folders  search: the build writes every locale in its own folder, the default one included
                        (e.g. next-intl's app/[locale]: /about is built as fr/about.html)
      --write           migrate: move the files, edit the config, write redirects.json (all or nothing)
  -h, --help            Show this help
  -v, --version         Show the version`;
