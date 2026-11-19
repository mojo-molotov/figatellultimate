import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { ASYNC_TIMEOUT } from '../timeouts.ts';

const ROOT = join(import.meta.dirname, '..', '..');

const CONFIGS = readdirSync(ROOT).filter((name) => /^vitest(\.[a-z]+)?\.config\.ts$/.test(name));

/**
 * The files under a folder, never entering hidden folders, `node_modules` nor `dist`: the end-to-end tests create
 * and remove their projects under `.tmp/` while this test reads, and a folder gone mid-walk once failed it.
 */
function walk(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);

    if (!entry.isDirectory()) return [path];

    return entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' ? [] : walk(path);
  });
}

/** Every test file of the packages and of the tooling. */
const TESTS = ['packages', 'tooling']
  .flatMap((folder) => walk(join(ROOT, folder)))
  .filter((path) => /\.test(-d)?\.tsx?$/.test(path));

const TESTS_API = new Set(['it', 'test', 'describe', 'suite', 'bench']);
const HOOKS = new Set(['beforeAll', 'beforeEach', 'afterAll', 'afterEach']);

/** The name a call starts from: `it` for `it(…)`, `it.each(…)(…)`, `it.skipIf(…)(…)` and `test.concurrent(…)`. */
function rootName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;

  if (ts.isPropertyAccessExpression(expression)) return rootName(expression.expression);

  if (ts.isCallExpression(expression)) return rootName(expression.expression);

  return undefined;
}

/** Whether a call registers a test or a hook that is not a modifier itself (`it.each([…])` alone only builds one). */
const isRegistration = (call: ts.CallExpression): boolean =>
  !(
    ts.isPropertyAccessExpression(call.expression) &&
    ['each', 'skipIf', 'runIf', 'for'].includes(call.expression.name.text)
  );

const hasTimeoutOption = (node: ts.Expression | undefined): boolean =>
  node !== undefined &&
  ts.isObjectLiteralExpression(node) &&
  node.properties.some(
    (property) => property.name !== undefined && ts.isIdentifier(property.name) && property.name.text === 'timeout',
  );

/** A `timeout` option below the generous wait, e.g. a `waitFor`'s `{ timeout: 3000 }`. */
const isShortWait = (node: ts.Node): boolean =>
  ts.isPropertyAssignment(node) &&
  ts.isIdentifier(node.name) &&
  node.name.text === 'timeout' &&
  ts.isNumericLiteral(node.initializer) &&
  Number(node.initializer.text.replaceAll('_', '')) < ASYNC_TIMEOUT;

/**
 * Whether a call gives its test or hook a timeout of its own: a third argument to a test (a number, a constant), a
 * second to a hook, or `{ timeout }` among a test's options.
 */
function hasOwnTimeout(call: ts.CallExpression): boolean {
  const name = rootName(call.expression);

  if (name === undefined || !isRegistration(call)) return false;

  if (HOOKS.has(name)) return call.arguments.length >= 2;

  if (!TESTS_API.has(name)) return false;

  return call.arguments.length >= 3 || call.arguments.some(hasTimeoutOption);
}

describe('test timeouts', () => {
  it('are the shared ones in every vitest configuration', () => {
    // Precondition: the four families' configurations were found.
    expect(CONFIGS.length).toBeGreaterThanOrEqual(4);

    for (const config of CONFIGS) {
      const source = readFileSync(join(ROOT, config), 'utf8');

      expect(source, config).toContain('...TEST_TIMEOUTS');
      expect(source, config).not.toMatch(/(test|hook)Timeout:/);
    }
  });

  it("are generous for the page's waits too, in every configuration that renders a DOM", () => {
    for (const config of ['vitest.config.ts', 'vitest.browser.config.ts']) {
      expect(readFileSync(join(ROOT, config), 'utf8'), config).toContain("'async-timeout.setup.ts'");
    }
  });

  it('are never set on a single test or hook, in any form, which would cut it short again', () => {
    expect(TESTS.length).toBeGreaterThan(50);

    const own = TESTS.flatMap((file) => {
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      const found: string[] = [];
      const visit = (node: ts.Node): void => {
        if ((ts.isCallExpression(node) && hasOwnTimeout(node)) || isShortWait(node)) {
          found.push(
            `${relative(ROOT, file)}:${String(source.getLineAndCharacterOfPosition(node.getStart()).line + 1)}`,
          );
        }

        ts.forEachChild(node, visit);
      };

      visit(source);

      return found;
    });

    expect(own).toEqual([]);
  });

  it.each([
    ["it('a', () => {}, 60_000);", true],
    ["it('a', () => {}, TIMEOUT);", true],
    ["it('a', { timeout: 1000 }, () => {});", true],
    ["it.each([1])('a %s', () => {}, 1000);", true],
    ["it.skipIf(slow)('a', async () => {}, 1000);", true],
    ["test.concurrent('a', () => {}, 1000);", true],
    ['beforeAll(() => {}, 1000);', true],
    ["it('a', () => {});", false],
    ["it.each([1])('a %s', (n) => {});", false],
    ["describe('a', () => {});", false],
    ['beforeEach(() => {});', false],
    ['waitFor(() => {}, { timeout: 30_000 });', false],
  ])('tells %s', (code, expected) => {
    const source = ts.createSourceFile('a.ts', code, ts.ScriptTarget.Latest, true);
    const statement = source.statements[0];
    const call = statement !== undefined && ts.isExpressionStatement(statement) ? statement.expression : undefined;

    expect(call !== undefined && ts.isCallExpression(call) && hasOwnTimeout(call)).toBe(expected);
  });

  it.each([
    ['waitFor(() => {}, { timeout: 3000 });', true],
    ['findByText(screen, "a", {}, { timeout: 2000 });', true],
    ['waitFor(() => {}, { timeout: 30_000 });', false],
    ['waitFor(() => {});', false],
  ])('tells a short wait in %s', (code, expected) => {
    const source = ts.createSourceFile('a.ts', code, ts.ScriptTarget.Latest, true);
    let short = false;
    const visit = (node: ts.Node): void => {
      short ||= isShortWait(node);
      ts.forEachChild(node, visit);
    };

    visit(source);

    expect(short).toBe(expected);
  });
});
