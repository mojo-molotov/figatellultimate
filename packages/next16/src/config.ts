/**
 * `@figatellultimate/next16/config`: the Next configuration for precompiled messages (Node, in `next.config.ts`).
 *
 *     next.config.ts ── withPrecompiledMessages ──> Turbopack alias: `use-intl/format-message` ──> `format-only`
 *
 * With every message precompiled on the server (`precompileMessages` of `@figatellultimate/use-intl/precompile`), next-intl
 * formats with its `format-only` runtime, which reads the compiled form and parses nothing: no page ships the ICU
 * parser.
 *
 * Key design decisions:
 *     - The alias next-intl's own `precompile` option sets, set by hand: that option compiles JSON or PO catalogs
 *       through a loader, while figatellultimate's messages are generated TypeScript modules, compiled by figatellultimate.
 *     - Resolved from the app's next-intl (its own `use-intl`), relative, `./`-prefixed and with forward slashes on every
 *       system, as Turbopack needs.
 *     - The resolution is an injection seam (`resolve`, `cwd`), for tests only: not an API to configure.
 *
 * Invariants (`config.test.ts`): the alias points at the app's `format-only`; the config's own aliases and options
 * are kept; a clear error without next-intl.
 *
 * Limitations: Turbopack only (Next 16's bundler), not webpack. `format-only` resolves a named date or time style
 * (`{day, date, long}`) from the app's `formats` only: declare them in next-intl's request configuration.
 */
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';

/**
 * What `withPrecompiledMessages` reads of a Next configuration: structural, so that the app's own Next version types
 * it (its `NextConfig` stays its own).
 */
export interface TurbopackConfig {
  readonly turbopack?: { readonly resolveAlias?: Readonly<Record<string, unknown>> | undefined } | undefined;
}

/** The resolution of `withPrecompiledMessages`, an injection seam for tests. */
export interface PrecompiledMessagesOptions {
  /** Resolves a module as Node does from a file; default `createRequire(from).resolve`. */
  readonly resolve?: ((specifier: string, from: string) => string) | undefined;
  /** The app's folder; default the working directory, where Next runs. */
  readonly cwd?: string | undefined;
}

const nodeResolve = (specifier: string, from: string): string => createRequire(from).resolve(specifier);

/**
 * The Next configuration with next-intl's formatter for precompiled messages.
 *
 * @param config - The app's Next configuration (its `NextConfig`).
 * @param options - The resolution (tests only).
 * @returns The same configuration, typed as given, with Turbopack's alias of `use-intl/format-message` to
 *   next-intl's `format-only`.
 * @throws {Error} When next-intl cannot be resolved from the app: precompiled messages need it.
 *
 * @example
 * export default createNextIntlPlugin('./i18n/request.ts')(withPrecompiledMessages(nextConfig));
 */
export function withPrecompiledMessages<C extends TurbopackConfig>(
  config: C,
  options: PrecompiledMessagesOptions = {},
): C {
  const cwd = options.cwd ?? process.cwd();
  const resolve = options.resolve ?? nodeResolve;
  let formatOnly: string;

  try {
    formatOnly = resolve('use-intl/format-message/format-only', resolve('next-intl/plugin', join(cwd, 'package.json')));
  } catch (error) {
    throw new Error(
      `withPrecompiledMessages: next-intl cannot be resolved from ${cwd} (${error instanceof Error ? error.message : String(error)}). Install next-intl in the app.`,
      { cause: error },
    );
  }

  const path = relative(cwd, formatOnly).replaceAll('\\', '/');

  return {
    ...config,
    turbopack: {
      ...config.turbopack,
      resolveAlias: {
        ...config.turbopack?.resolveAlias,
        'use-intl/format-message': path.startsWith('.') ? path : `./${path}`,
      },
    },
  };
}
