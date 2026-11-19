import { playwright } from '@vitest/browser-playwright';
import { defineConfig, type ViteUserConfig } from 'vitest/config';

import { allureReporter } from './tooling/allure.ts';
import { TEST_TIMEOUTS } from './tooling/timeouts.ts';

/**
 * The component tests, replayed unchanged in real browsers: layout, focus and keyboard as users get them.
 * Run by `pnpm test:browser` and the weekly `Browsers` workflow; happy-dom runs the same files on every pull request.
 */
const PACKAGES = ['effects', 'facets-react', 'search-react', 'ui'];

const config: ViteUserConfig = defineConfig({
  resolve: { conditions: ['@figatellultimate/source'] },
  test: {
    reporters: ['default', allureReporter('browsers')],
    ...TEST_TIMEOUTS,
    projects: PACKAGES.map((name) => ({
      resolve: { conditions: ['@figatellultimate/source'] },
      // Not `extends: true`: each project repeats what it needs of the root, its timeouts included.
      test: {
        ...TEST_TIMEOUTS,
        name: `${name} (browser)`,
        root: `packages/${name}`,
        include: ['src/__tests__/**/*.test.tsx'],
        browser: {
          enabled: true,
          headless: true,
          // A desktop window: below 48rem, the navbar's stylesheet hides its list behind the menu toggle.
          viewport: { width: 1280, height: 800 },
          provider: playwright(),
          instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
        },
      },
    })),
  },
});

export default config;
