/**
 * The config's loading: `figatellultimate.config.ts` imported with Node's native type stripping (no other TypeScript
 * loader), its default export validated by core's `parseConfig`.
 */
import { access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  err,
  InvalidConfigError,
  ok,
  parseConfig,
  type FigatellultimateConfig,
  type Result,
} from '@figatellultimate/core';

/**
 * A loaded config, and where it lives.
 *
 */
export interface LoadedConfig {
  readonly config: FigatellultimateConfig;
  /** Absolute directory of the config file: the project root for listing paths and for the output folder. */
  readonly directory: string;
  readonly path: string;
}

/**
 * Why a config could not be used: not found, not loadable (e.g. non-erasable TypeScript), or invalid; never an
 * absolute path.
 *
 */
export interface ConfigProblem {
  readonly code: 'invalid-config';
  readonly message: string;
  readonly hint?: string | undefined;
}

/** Node's reasons for refusing to strip types, turned into advice. */
function loadingHint(error: unknown): string | undefined {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';

  if (code === 'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX') {
    return 'figatellultimate.config.ts is run by Node itself: use erasable TypeScript only (no enum, no namespace)';
  }

  if (code === 'ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING') return 'the config file cannot live under node_modules';

  if (code === 'ERR_MODULE_NOT_FOUND') return 'a module imported by the config is missing: is it installed?';

  return undefined;
}

/** Fresh loads so far (see `loadConfig`). */
let generation = 0;

/**
 * Loads `figatellultimate.config.ts` with Node's native type stripping and validates it. `fresh` bypasses Node's
 * module cache (watch mode reloads the config after a change).
 *
 * @param path - The config's path, as given.
 * @param cwd - The working directory it is resolved against.
 * @param fresh - Bypass Node's module cache (watch mode reloads the config after a change).
 * @returns The validated config, or the problem.
 */
export async function loadConfig(
  path: string,
  cwd: string,
  fresh = false,
): Promise<Result<LoadedConfig, ConfigProblem>> {
  const absolute = resolve(cwd, path);

  try {
    await access(absolute);
  } catch {
    return err({
      code: 'invalid-config',
      message: `No config file at ${path}.`,
      hint: 'create figatellultimate.config.ts, or pass --config <path>',
    });
  }

  let loaded: unknown;

  try {
    const url = pathToFileURL(absolute);

    // A counter, not only the time: two loads in the same millisecond must not share Node's cached module.
    if (fresh) url.searchParams.set('t', `${String(Date.now())}-${String(++generation)}`);

    const module: unknown = await import(url.href);

    loaded = typeof module === 'object' && module !== null && 'default' in module ? module.default : undefined;
  } catch (error) {
    return err({
      code: 'invalid-config',
      message: `Cannot load ${path}: ${error instanceof Error ? error.message : String(error)}`,
      hint: loadingHint(error),
    });
  }

  try {
    // Checked even when the user called defineConfig: the default export is untrusted until then.
    return ok({ config: parseConfig(loaded), directory: dirname(absolute), path: absolute });
  } catch (error) {
    if (!(error instanceof InvalidConfigError)) throw error;

    return err({
      code: 'invalid-config',
      message: error.message,
      hint: 'export default defineConfig({ … }) from the config file',
    });
  }
}
