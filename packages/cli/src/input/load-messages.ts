/**
 * The message modules' loading: `messages/<locale>.ts` imported with Node's type stripping, always afresh, as
 * untrusted data for `analyzeMessages` (`load-messages.test.ts`).
 */
import { readdir } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { UnreadableMessageModuleDiagnostic } from '@figatellu/messages';

/**
 * Every message module found, by file name, and the diagnostics of those that could not load.
 *
 */
export interface LoadedMessages {
  /** The default export of each `*.ts` module of the folder, by file name. */
  readonly modules: Readonly<Record<string, unknown>>;
  readonly diagnostics: readonly UnreadableMessageModuleDiagnostic[];
}

/** Distinguishes two loads in the same millisecond. */
let loads = 0;

/**
 * Node's errors name files by absolute path or URL, in several spellings (native, POSIX, URL path, encoded or not,
 * `/D:/…` on Windows): every spelling of the folder is removed, so only folder-relative names remain.
 */
function withoutAbsolutePaths(message: string, directory: string): string {
  const url = pathToFileURL(directory);
  const spellings = [
    url.href,
    url.pathname,
    decodeURIComponent(url.pathname),
    directory,
    directory.split(sep).join('/'),
  ];
  let result = message;

  // Longest first: a URL contains the path spellings.
  for (const spelling of [...new Set(spellings)].sort((a, b) => b.length - a.length)) {
    result = result.replaceAll(`${spelling}/`, '').replaceAll(`${spelling}${sep}`, '');
  }

  return result;
}

/**
 * Loads every message module of a folder with Node's native type stripping, as untrusted data that
 * `analyzeMessages` checks. A missing folder holds no module (the analysis reports each missing locale). Modules are
 * always read afresh, bypassing Node's module cache: a run never sees a stale translation (watch, repeated runs in a
 * process). Loading errors never carry the machine's absolute paths. The schema module is never loaded.
 *
 * @param directory - The messages folder.
 * @param schema - The schema module's file name, never loaded as a locale.
 * @returns Each module's default export by file name, and a diagnostic per module that cannot load.
 */
export async function loadMessageModules(directory: string, schema?: string): Promise<LoadedMessages> {
  let names: string[];

  try {
    names = (await readdir(directory, { withFileTypes: true }))
      .filter(
        (entry) =>
          entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') && entry.name !== schema,
      )
      .map((entry) => entry.name)
      .sort();
  } catch {
    return { modules: {}, diagnostics: [] };
  }

  const modules: Record<string, unknown> = {};
  const diagnostics: UnreadableMessageModuleDiagnostic[] = [];

  for (const name of names) {
    const url = pathToFileURL(join(directory, name));

    // Digits only: loaders infer the language from the id's last extension, query included.
    loads += 1;
    url.searchParams.set('t', `${String(Date.now())}${String(loads)}`);

    try {
      const module: unknown = await import(url.href);

      modules[name] = typeof module === 'object' && module !== null && 'default' in module ? module.default : undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      diagnostics.push({
        code: 'unreadable-message-module',
        severity: 'error',
        file: name,
        key: null,
        data: { message: withoutAbsolutePaths(message, directory) },
        suggestions: [],
      });
    }
  }

  return { modules, diagnostics };
}
