/**
 * No useless fragment: a `<>…</>` holding a single child (or none) is the child itself, written twice. One rule,
 * fixed by `eslint --fix`, shared by the workspace's configuration (`eslint.ts`) and the example app's
 * (`examples/next/eslint.config.ts`).
 *
 * Key design decisions:
 *     - `@eslint-react`'s rule (`jsx-no-useless-fragment`), not `eslint-plugin-react`'s: the latter does not run on
 *       ESLint 10.
 *     - Its rule alone, not its recommended set: the React rules the workspace enforces are its own choices.
 */
import eslintReact from '@eslint-react/eslint-plugin';
import type { ESLint, Linter } from 'eslint';

/**
 * The no-useless-fragment configuration for the given files.
 *
 * @param files - The globs it applies to.
 * @returns A flat config object: the `@eslint-react` plugin and its `jsx-no-useless-fragment` rule.
 *
 * @example
 * export default [fragments(['**\/*.tsx'])];
 */
export function fragments(files: readonly string[]): Linter.Config {
  // The plugin's own type is wider than ESLint's: its rules are checked by ESLint, not by this type.
  const plugin: ESLint.Plugin = eslintReact;

  return {
    name: 'figatellultimate/no-useless-fragments',
    files: [...files],
    plugins: { '@eslint-react': plugin },
    rules: { '@eslint-react/jsx-no-useless-fragment': ['error', { allowExpressions: false }] },
  };
}
