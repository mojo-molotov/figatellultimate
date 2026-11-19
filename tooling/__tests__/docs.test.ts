/**
 * Documentation invariants: the code and the tests are the documentation, so its shape is checked like any other
 * invariant.
 *
 *     package sources ──> TypeScript program (parsed, bound, never type-checked)
 *         ├──> every module: a header comment
 *         ├──> every export: a JSDoc
 *         ├──> every exported function: one `@param` per parameter, `@returns` unless it returns nothing
 *         └──> every public function (reachable from a package entry): shown in an `@example` of its module
 *
 * Key design decisions:
 *     - The compiler API, not regular expressions: overloads are one export documented once, re-exports resolve to
 *       their declaration, and a public function is one a package's `exports` reach, whatever file declares it.
 *     - A function with overloads is documented by its first documented signature, the one editors show.
 *     - Parameters are counted, not matched by name: a destructured parameter is documented under the name the
 *       reader knows it by (e.g. `props`).
 *     - Internal functions need no `@example`: the module header shows how they fit together.
 *     - A compound component's parts are shown in their root's example (`<Pagination>` with `<PaginationLink>`):
 *       a public function counts as shown when any `@example` of its module uses it.
 *
 * Limitations: the content of a comment is not judged, only its presence; the example app is not checked.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { discoverPackages } from '../boundaries/roles.ts';

const ROOT = join(import.meta.dirname, '..', '..');

/** Source files of a folder, tests and declaration files excepted. */
function sourcesUnder(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;

    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourcesUnder(path);

    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

/** Every `@figatellultimate/source` entry of a manifest's `exports`. */
function entriesOf(dir: string): string[] {
  const manifest: unknown = JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8'));
  const exports = typeof manifest === 'object' && manifest !== null && 'exports' in manifest ? manifest.exports : {};

  return Object.values(typeof exports === 'object' && exports !== null ? exports : {}).flatMap(
    (conditions: unknown) => {
      const source: unknown =
        typeof conditions === 'object' && conditions !== null && '@figatellultimate/source' in conditions
          ? conditions['@figatellultimate/source']
          : undefined;

      return typeof source === 'string' && /\.tsx?$/.test(source) ? [`${dir}/${source.slice(2)}`] : [];
    },
  );
}

const packages = discoverPackages(ROOT);
const files = [...packages.flatMap((pkg) => sourcesUnder(`${pkg.dir}/src`)), ...sourcesUnder('tooling/boundaries')];
const entries = packages.flatMap((pkg) => entriesOf(pkg.dir));

const program = ts.createProgram({
  rootNames: files.map((file) => join(ROOT, file)),
  options: {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    customConditions: ['@figatellultimate/source'],
    jsx: ts.JsxEmit.ReactJSX,
    allowImportingTsExtensions: true,
    noEmit: true,
    skipLibCheck: true,
  },
});
const checker = program.getTypeChecker();
const sourceOf = (file: string): ts.SourceFile => {
  const source = program.getSourceFile(join(ROOT, file));

  if (source === undefined) throw new Error(`${file} is not in the program`);

  return source;
};

/** A declaration's JSDoc blocks (a variable's are on its statement). */
const docsOf = (node: ts.Node): readonly ts.JSDoc[] =>
  ts.getJSDocCommentsAndTags(node).filter((doc): doc is ts.JSDoc => ts.isJSDoc(doc));

/** What a function declaration or a function-valued variable looks like as a signature, `undefined` otherwise. */
function signatureOf(node: ts.Node): ts.SignatureDeclaration | undefined {
  if (ts.isFunctionDeclaration(node)) return node;

  if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
    const value = node.initializer;

    if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) return value;
  }

  return undefined;
}

/** The declarations a statement exports, by name. */
function exportedDeclarations(statement: ts.Statement): (readonly [string, ts.Node])[] {
  const exported = ts.canHaveModifiers(statement)
    ? (ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false)
    : false;

  if (!exported) return [];

  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.map((declaration) => [declaration.name.getText(), declaration]);
  }

  if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)) &&
    statement.name !== undefined
  ) {
    return [[statement.name.text, statement]];
  }

  return [];
}

/** Each exported name of a file with its declarations (overloads together) and the JSDoc that documents it. */
function exportsOf(file: string): { readonly name: string; readonly node: ts.Node; readonly doc?: ts.JSDoc }[] {
  const byName = new Map<string, ts.Node[]>();

  for (const [name, node] of sourceOf(file).statements.flatMap(exportedDeclarations)) {
    byName.set(name, [...(byName.get(name) ?? []), node]);
  }

  return [...byName].map(([name, nodes]) => {
    const documented = nodes.find((node) => docsOf(node).length > 0) ?? nodes[0];
    const doc = documented === undefined ? undefined : docsOf(documented).at(-1);

    return { name, node: documented ?? nodes[0] ?? sourceOf(file), ...(doc === undefined ? {} : { doc }) };
  });
}

const tagsOf = (doc: ts.JSDoc, name: string): readonly ts.JSDocTag[] =>
  (doc.tags ?? []).filter((tag) => tag.tagName.text === name);

/** Whether a signature returns nothing worth a `@returns`: `void`, `Promise<void>` or `never`. */
const returnsNothing = (signature: ts.SignatureDeclaration): boolean =>
  signature.type !== undefined && /^(void|never|Promise<void>)$/.test(signature.type.getText());

describe('documentation', () => {
  it('every module opens with a header comment', () => {
    const missing = files.filter((file) => {
      const text = sourceOf(file)
        .text.replace(/^#!.*\n/, '')
        .replace(/^\s*['"]use client['"];?\s*/, '')
        .trimStart();

      return !text.startsWith('/*');
    });

    expect(missing, `missing:\n${missing.join('\n')}`).toEqual([]);
  });

  it('every export carries a JSDoc', () => {
    const missing = files.flatMap((file) =>
      exportsOf(file).flatMap(({ name, doc }) => (doc === undefined ? [`${file}: ${name}`] : [])),
    );

    expect(missing, `missing:\n${missing.join('\n')}`).toEqual([]);
  });

  it('every exported function documents each parameter and what it returns', () => {
    const missing = files.flatMap((file) =>
      exportsOf(file).flatMap(({ name, node, doc }) => {
        const signature = signatureOf(node);

        if (signature === undefined || doc === undefined) return [];

        const params = tagsOf(doc, 'param').filter((tag) => ts.isJSDocParameterTag(tag) && ts.isIdentifier(tag.name));
        const problems = [
          ...(params.length < signature.parameters.length ? ['@param'] : []),
          ...(tagsOf(doc, 'returns').length === 0 && !returnsNothing(signature) ? ['@returns'] : []),
        ];

        return problems.length === 0 ? [] : [`${file}: ${name} (${problems.join(', ')})`];
      }),
    );

    expect(missing, `missing:\n${missing.join('\n')}`).toEqual([]);
  });

  it('every public function shows an example', () => {
    const publicFunctions = new Set<string>();

    for (const entry of entries) {
      const module = checker.getSymbolAtLocation(sourceOf(entry));

      for (const exported of module === undefined ? [] : checker.getExportsOfModule(module)) {
        const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
        const declaration = symbol.declarations?.[0];

        if (declaration === undefined || signatureOf(declaration) === undefined) continue;

        const file = declaration.getSourceFile().fileName.slice(ROOT.length + 1);

        publicFunctions.add(`${file}: ${symbol.name}`);
      }
    }

    const missing = files.flatMap((file) => {
      const declared = exportsOf(file);
      const examples = declared
        .flatMap(({ doc }) => (doc === undefined ? [] : tagsOf(doc, 'example')))
        .map((tag) => tag.getText());

      return declared.flatMap(({ name }) =>
        publicFunctions.has(`${file}: ${name}`) &&
        !examples.some((example) => new RegExp(`\\b${name}\\b`).test(example))
          ? [`${file}: ${name}`]
          : [],
      );
    });

    expect(missing, `missing:\n${missing.join('\n')}`).toEqual([]);
  });
});
