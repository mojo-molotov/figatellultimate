import { resolve as absolute } from 'node:path';

import type { NextConfig } from 'next';
import { describe, expect, it } from 'vitest';

import { withPrecompiledMessages } from '../config.js';

// Absolute on every system (a drive letter on Windows): the alias is the same everywhere.
const cwd = absolute('/app');
// The app's next-intl, and its own use-intl, as Node would resolve them in a pnpm tree.
const modules: Readonly<Record<string, string>> = {
  'next-intl/plugin': absolute('/app/node_modules/next-intl/dist/esm/plugin.js'),
  'use-intl/format-message/format-only': absolute('/store/use-intl/dist/esm/format-message/format-only.js'),
};
// An app's configuration, typed by its own Next.
const empty: NextConfig = {};
const resolve = (specifier: string): string => {
  const path = modules[specifier];

  if (path === undefined) throw new Error(`Cannot find module '${specifier}'`);

  return path;
};

describe('withPrecompiledMessages', () => {
  it("aliases use-intl's formatter to the app's format-only, relative to the app", () => {
    const config = withPrecompiledMessages(empty, { cwd, resolve });

    expect(config.turbopack?.resolveAlias).toEqual({
      'use-intl/format-message': '../store/use-intl/dist/esm/format-message/format-only.js',
    });
  });

  it('prefixes a path inside the app with ./, as Turbopack needs', () => {
    const inside = (specifier: string): string =>
      specifier === 'next-intl/plugin'
        ? resolve(specifier)
        : absolute('/app/node_modules/use-intl/dist/esm/format-message/format-only.js');

    expect(withPrecompiledMessages(empty, { cwd, resolve: inside }).turbopack?.resolveAlias).toEqual({
      'use-intl/format-message': './node_modules/use-intl/dist/esm/format-message/format-only.js',
    });
  });

  it("keeps the config's own options and aliases", () => {
    const own: NextConfig = { reactStrictMode: true, turbopack: { resolveAlias: { 'a-module': './b.js' } } };
    const config = withPrecompiledMessages(own, { cwd, resolve });

    expect(config.reactStrictMode).toBe(true);
    expect(config.turbopack?.resolveAlias).toEqual({
      'a-module': './b.js',
      'use-intl/format-message': '../store/use-intl/dist/esm/format-message/format-only.js',
    });
  });

  it('throws a clear error without next-intl', () => {
    expect(() => withPrecompiledMessages(empty, { cwd, resolve: () => resolve('nothing') })).toThrow(
      /next-intl cannot be resolved from .*app .*Install next-intl in the app\./,
    );
  });
});
