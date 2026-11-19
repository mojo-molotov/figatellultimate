/**
 * Workspace invariants, per package: the shared tsconfig, ESM only, MIT, only `dist` shipped, the `__tests__`
 * convention, and package resolution through sources.
 *
 * Package resolution: inside the workspace, packages resolve each other through their sources: each package exports
 * a `@figatellultimate/source` condition pointing to its `src/` entry, used by TypeScript (`customConditions`), vitest,
 * ESLint's resolver and dependency-cruiser, so nothing needs building before typechecking, linting or testing.
 * `publishConfig.exports` drops that condition, so a published package only exposes `dist` (then checked by publint
 * and attw on the packed tarball).
 *
 * Conventions: tests live in a sibling `__tests__` folder next to the code they test, with their scenarios and
 * fixtures; shipped code never imports from one.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { discoverPackages } from '../boundaries/roles.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const packages = discoverPackages(ROOT);

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

/** A manifest's object field, `{}` when absent or not an object. */
const objectAt = (value: unknown, key: string): Readonly<Record<string, unknown>> => {
  const field = isRecord(value) ? value[key] : undefined;

  return isRecord(field) ? field : {};
};

/** Folders never entered: dependencies (symlinked workspace packages too), build output, fixtures, test trees. */
const SKIPPED = new Set(['node_modules', 'dist', 'fixtures', '.tmp']);

/**
 * Every file under `dir` (POSIX, relative to ROOT). Skipped folders are never entered: a recursive `readdirSync`
 * would walk them, and race with tests creating and removing their disposable trees.
 */
function filesUnder(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;

    if (entry.isDirectory()) return SKIPPED.has(entry.name) ? [] : filesUnder(path);

    return entry.isFile() ? [path] : [];
  });
}

describe('workspace invariants', () => {
  it('keeps every test file in a sibling `__tests__` folder', () => {
    const tests = [...filesUnder('packages'), ...filesUnder('tooling')].filter((path) =>
      /\.test(-d)?\.tsx?$/.test(path),
    );

    // Precondition: the scan finds test files at all, so an empty scan cannot pass.
    expect(tests.length).toBeGreaterThan(0);
    expect(tests.filter((path) => !path.includes('/__tests__/'))).toEqual([]);
  });

  it('has at least one package (guards against an empty, vacuously passing loop)', () => {
    expect(packages.length).toBeGreaterThan(0);
  });

  describe.each(packages)('$name', (pkg) => {
    it('extends the shared strict tsconfig', () => {
      expect(readJson(`${pkg.dir}/tsconfig.json`)).toMatchObject({ extends: '../../tsconfig.base.json' });
    });

    it('resolves through its sources in the workspace, and only through dist once published', () => {
      const manifest = readJson(`${pkg.dir}/package.json`);
      const exports = Object.entries(objectAt(manifest, 'exports'));
      const conditional = exports.filter(
        (entry): entry is [string, Record<string, unknown>] => typeof entry[1] === 'object',
      );

      // Precondition: at least one conditional entry (the main one, or a stylesheet for a styles-only package such as
      // the themes), so the checks below cannot pass vacuously.
      expect(conditional.length).toBeGreaterThan(0);

      for (const [subpath, conditions] of conditional) {
        // A stylesheet export (`./styles.css`) points to its CSS source; every other one to TypeScript.
        expect(conditions['@figatellultimate/source']).toMatch(
          subpath.endsWith('.css') ? /^\.\/src\/.+\.css$/ : /^\.\/src\/.+\.ts$/,
        );
      }

      // The published exports are the workspace ones, each without the source condition.
      const published = Object.fromEntries(
        exports.map(([subpath, target]) => [
          subpath,
          typeof target === 'object' && target !== null
            ? Object.fromEntries(
                Object.entries(target).filter(([condition]) => condition !== '@figatellultimate/source'),
              )
            : target,
        ]),
      );

      expect(objectAt(manifest, 'publishConfig')['exports']).toEqual(published);
    });

    it('is ESM-only, MIT, side-effect free and ships only dist', () => {
      const manifest = readJson(`${pkg.dir}/package.json`);
      // A stylesheet is a side effect by nature: a package exporting one declares exactly its CSS.
      const styles = Object.keys(objectAt(manifest, 'exports')).some((subpath) => subpath.endsWith('.css'));

      expect(manifest).toMatchObject({
        type: 'module',
        license: 'MIT',
        sideEffects: styles ? ['*.css'] : false,
        files: ['dist'],
      });
    });
  });
});
