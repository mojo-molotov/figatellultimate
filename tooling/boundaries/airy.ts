/**
 * Airy code: a blank line before a `return`, after a group of declarations, and around control flow (`if`, loops,
 * `switch`, `try`), inside every function, tests included. One rule, fixed by `eslint --fix`, shared by the
 * workspace's configuration (`eslint.ts`) and the example app's (`examples/next/eslint.config.ts`).
 *
 * Key design decisions:
 *     - A lint rule, not a convention: it is checked with `--max-warnings 0` and fixed mechanically, so it never
 *       drifts.
 *     - Consecutive declarations stay together: a group of `const` reads as one step.
 */
import stylistic from '@stylistic/eslint-plugin';
import type { Linter } from 'eslint';

const CONTROL_FLOW = ['if', 'for', 'while', 'do', 'switch', 'try'];
const DECLARATIONS = ['const', 'let', 'var'];

/**
 * The airy-code configuration for the given files.
 *
 * @param files - The globs it applies to.
 * @returns A flat config object: the `@stylistic` plugin and its `padding-line-between-statements` rule.
 *
 * @example
 * export default [airy(['**\/*.{ts,tsx}'])];
 */
export function airy(files: readonly string[]): Linter.Config {
  return {
    name: 'figatellultimate/airy-functions',
    files: [...files],
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: 'return' },
        { blankLine: 'always', prev: DECLARATIONS, next: '*' },
        { blankLine: 'any', prev: DECLARATIONS, next: DECLARATIONS },
        { blankLine: 'always', prev: '*', next: CONTROL_FLOW },
        { blankLine: 'always', prev: CONTROL_FLOW, next: '*' },
        { blankLine: 'always', prev: 'directive', next: '*' },
      ],
    },
  };
}
