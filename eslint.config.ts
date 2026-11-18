import type { Linter } from 'eslint';

import { createEslintConfig } from './tooling/boundaries/eslint.ts';

const config: Linter.Config[] = createEslintConfig(import.meta.dirname, [
  'tooling/boundaries/__tests__/fixtures/**',
  'playground.*',
  // Disposable test trees, normally removed by the tests that create them.
  '**/.tmp/**',
  // The example app is checked by its own `next build` and verification, in a scheduled workflow.
  'examples/**',
]);

export default config;
