/**
 * The example's lint: unused variables and the workspace's airy-code rule; the rest is checked by its `next build`
 * and `example:verify`.
 */
import type { Linter } from 'eslint';
import { parser, plugin } from 'typescript-eslint';

import { airy } from '../../tooling/boundaries/airy.ts';

const config: Linter.Config[] = [
  // Relative to where ESLint runs (the workspace's root, or here): at any depth.
  { ignores: ['**/.next/**', '**/.figatellultimate/**', '**/public/**', '**/next-env.d.ts', '**/*.{js,mjs,cjs}'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser },
    plugins: { '@typescript-eslint': plugin },
    rules: { '@typescript-eslint/no-unused-vars': 'error' },
  },
  airy(['**/*.{ts,tsx}']),
];

export default config;
