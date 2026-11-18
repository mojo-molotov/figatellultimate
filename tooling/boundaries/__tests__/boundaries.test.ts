import { join } from 'node:path';

import { cruise, type ICruiseResult } from 'dependency-cruiser';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

import { createDepcruiseConfig } from '../depcruise.ts';
import { createEslintConfig } from '../eslint.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const CORE = 'packages/core/src';

let eslintRules: Map<string, string[]>;
let cruiseResult: ICruiseResult;

/** ESLint rule ids reported per fixture file (POSIX path relative to the fixture root). */
async function lintFixtures(): Promise<Map<string, string[]>> {
  const eslint = new ESLint({
    cwd: FIXTURES,
    overrideConfigFile: true,
    overrideConfig: createEslintConfig(FIXTURES),
  });
  const results = await eslint.lintFiles(['packages/*/src/**/*.{ts,tsx}']);

  return new Map(
    results.map((result) => [
      result.filePath.slice(FIXTURES.length + 1).replaceAll('\\', '/'),
      result.messages.map((message) => message.ruleId ?? `fatal: ${message.message}`),
    ]),
  );
}

async function cruiseFixtures(): Promise<ICruiseResult> {
  const config = createDepcruiseConfig(FIXTURES);
  const previousCwd = process.cwd();

  process.chdir(FIXTURES); // dependency-cruiser resolves paths from the cwd

  try {
    const reporterOutput = await cruise(['packages'], {
      ...config.options,
      ruleSet: { forbidden: config.forbidden ?? [] },
      validate: true,
    });

    if (typeof reporterOutput.output === 'string') throw new Error('Unexpected string output from dependency-cruiser');

    return reporterOutput.output;
  } finally {
    process.chdir(previousCwd);
  }
}

function depcruiseViolations(from: string): string[] {
  return cruiseResult.summary.violations.filter((v) => v.from === from).map((v) => v.rule.name);
}

function eslintRuleIds(file: string): string[] {
  const ids = eslintRules.get(file);

  if (ids === undefined) throw new Error(`Fixture not linted: ${file}`);

  return ids;
}

beforeAll(async () => {
  [eslintRules, cruiseResult] = await Promise.all([lintFixtures(), cruiseFixtures()]);
}, 60_000);

describe('boundary rules (negative fixtures)', () => {
  it('reports nothing on the control fixture', () => {
    expect(eslintRuleIds(`${CORE}/clean.ts`)).toEqual([]);
    expect(depcruiseViolations(`${CORE}/clean.ts`)).toEqual([]);
  });

  it('forbids core → adapter in ESLint and dependency-cruiser', () => {
    expect(eslintRuleIds(`${CORE}/imports-adapter.ts`)).toContain('no-restricted-imports');
    expect(depcruiseViolations(`${CORE}/imports-adapter.ts`)).toContain('role-boundary');
  });

  it('applies the same rules to .tsx files (React components)', () => {
    expect(eslintRuleIds(`${CORE}/imports-adapter-tsx.tsx`)).toContain('no-restricted-imports');
    expect(depcruiseViolations(`${CORE}/imports-adapter-tsx.tsx`)).toContain('role-boundary');
  });

  it('forbids Node builtins in core in ESLint and dependency-cruiser', () => {
    expect(eslintRuleIds(`${CORE}/imports-node.ts`)).toContain('no-restricted-imports');
    expect(depcruiseViolations(`${CORE}/imports-node.ts`)).toContain('universal-no-node-builtins');
  });

  it('forbids reading `process` in core', () => {
    expect(eslintRuleIds(`${CORE}/reads-process.ts`)).toContain('no-restricted-globals');
  });

  it('forbids import cycles in ESLint and dependency-cruiser', () => {
    expect(eslintRuleIds(`${CORE}/cycle-a.ts`)).toContain('import-x/no-cycle');
    expect(depcruiseViolations(`${CORE}/cycle-a.ts`)).toContain('no-circular');
  });

  it('non-awaited async predicate in a guard is a lint error', () => {
    expect(eslintRuleIds(`${CORE}/async-guard.ts`)).toContain('@typescript-eslint/no-misused-promises');
  });

  it('forbids shipped code from importing `__tests__` files', () => {
    expect(depcruiseViolations(`${CORE}/imports-tests.ts`)).toContain('no-tests-in-shipped-code');
    expect(depcruiseViolations(`${CORE}/__tests__/helper.ts`)).toEqual([]);
  });

  it('forbids a core layer from importing an upper one, allows the reverse', () => {
    expect(depcruiseViolations(`${CORE}/shared/imports-upper-layer.ts`)).toContain('core-layers');
    expect(depcruiseViolations(`${CORE}/content/imports-lower-layer.ts`)).toEqual([]);
  });

  it('forbids range or file coverage ignores', () => {
    expect(eslintRuleIds(`${CORE}/coverage-ignore.ts`)).toContain('no-warning-comments');
  });
});
