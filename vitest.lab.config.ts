import { defineConfig, type ViteUserConfig } from 'vitest/config';

import { allureReporter } from './tooling/allure.ts';

// Watch lab: slow, timing-dependent end-to-end suites, run by `pnpm test:lab` and a scheduled CI job.
const config: ViteUserConfig = defineConfig({
  resolve: { conditions: ['@figatellu/source'] },
  ssr: { resolve: { conditions: ['@figatellu/source', 'node'] } },
  test: {
    reporters: ['default', allureReporter('lab')],
    include: ['packages/*/src/**/__tests__/**/*.lab.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.tmp/**'],
    fileParallelism: false,
  },
});

export default config;
