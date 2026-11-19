import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  ignore: ['tooling/boundaries/__tests__/fixtures/**'],
  // The example app is checked by its own `next build` and verification, in a scheduled workflow.
  ignoreWorkspaces: ['examples/*'],
  workspaces: {
    '.': {
      // `allurerc.mjs` is read by the Allure CLI (`allure generate`), never imported.
      entry: ['tooling/**/*.test.ts', 'allurerc.mjs'],
    },
    'packages/*': {},
    'packages/content-collections': {
      // Imported only by the Content Collections configs generated at test time, invisible to knip.
      ignoreDependencies: ['valibot', 'zod'],
    },
    'packages/cli': {
      // Imported only by the configs of the end-to-end project generated at test time, invisible to knip.
      ignoreDependencies: ['@content-collections/core', '@figatellultimate/content-collections', 'valibot'],
    },
  },
};

export default config;
