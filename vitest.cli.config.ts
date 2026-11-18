import { defineConfig, type ViteUserConfig } from 'vitest/config';

import { allureReporter } from './tooling/allure.ts';

// The command line's surface: the built binary in real processes (`*.cli.test.ts`), run by `pnpm test:cli` after
// `pnpm build`, and in CI right after the build.
const config: ViteUserConfig = defineConfig({
  // Paths resolve from the repository's root, wherever vitest runs (the root, or `@figatellu/cli` through Turborepo).
  root: import.meta.dirname,
  test: {
    reporters: ['default', allureReporter('cli')],
    include: ['packages/*/src/**/__tests__/**/*.cli.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.tmp/**'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});

export default config;
