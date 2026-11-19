import { readdirSync, readFileSync } from 'node:fs';
import { join, matchesGlob } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import config from '../../vitest.config.ts';

const ROOT = join(import.meta.dirname, '..', '..');

const coverage = config.test?.coverage;
const include = coverage !== undefined && 'include' in coverage ? (coverage.include ?? []) : [];
const exclude = coverage !== undefined && 'exclude' in coverage ? (coverage.exclude ?? []) : [];

/** The packages the coverage measures, from `packages/{a,b}/src/**`. */
const packages = include.flatMap(
  (pattern) => /^packages\/\{([^}]+)\}\/src\/\*\*$/.exec(pattern)?.[1]?.split(',') ?? [],
);

/** Top-level statements that run nothing: types, imports and re-exports. */
const TYPES_ONLY = new Set([
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.ImportDeclaration,
  ts.SyntaxKind.ExportDeclaration,
]);

/** Whether a source file holds runtime code, not only types, imports and re-exports. */
const hasCode = (file: string, source: string): boolean =>
  ts
    .createSourceFile(file, source, ts.ScriptTarget.Latest)
    .statements.some((statement) => !TYPES_ONLY.has(statement.kind));

describe('the coverage configuration', () => {
  it('measures every source file holding code in the packages it covers, an entry point included', () => {
    // Precondition: the configuration was read.
    expect(packages.length).toBeGreaterThan(1);

    const hidden = packages.flatMap((name) =>
      readdirSync(join(ROOT, 'packages', name, 'src'), { recursive: true, encoding: 'utf8' })
        .map((path) => `packages/${name}/src/${path.split('\\').join('/')}`)
        .filter((file) => /\.tsx?$/.test(file) && !file.includes('/__tests__/'))
        .filter((file) => exclude.some((pattern) => matchesGlob(file, pattern)))
        .filter((file) => hasCode(file, readFileSync(join(ROOT, file), 'utf8'))),
    );

    expect(hidden).toEqual([]);
  });
});
