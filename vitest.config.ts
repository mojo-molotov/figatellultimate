import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { defineConfig, type TestProjectConfiguration, type ViteUserConfig } from 'vitest/config';

import { allureReporter } from './tooling/allure.ts';

/** The repository's root: every path below resolves from here, wherever vitest runs (the root, or a package). */
const ROOT = import.meta.dirname;

// One project per package, declared explicitly so that each one inherits the root
// `typecheck` settings (glob projects don't) and type-checks with its own tsconfig. A package's `test` script runs
// its own project (`--project <name>`), through Turborepo.
const packageProjects: TestProjectConfiguration[] = readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    extends: true,
    test: {
      name: entry.name,
      root: join(ROOT, 'packages', entry.name),
      typecheck: { tsconfig: './tsconfig.json' },
    },
  }));

const config: ViteUserConfig = defineConfig({
  root: ROOT,
  // Workspace packages resolve each other through their sources: no build needed to test.
  // Tests run server-side (Node), where Vite reads `ssr.resolve.conditions`; `node` keeps Node's own resolution.
  resolve: { conditions: ['@figatellultimate/source'] },
  ssr: { resolve: { conditions: ['@figatellultimate/source', 'node'] } },
  test: {
    reporters: ['default', allureReporter('scenarios')],
    setupFiles: [join(ROOT, 'tooling', 'fast-check.setup.ts')],
    include: ['**/*.test.{ts,tsx}'],
    // `*.lab.test.ts`: the watch lab, run by `pnpm test:lab` only; `*.cli.test.ts`: the built CLI, `pnpm test:cli`.
    exclude: ['**/node_modules/**', '**/dist/**', '**/fixtures/**', '**/*.lab.test.ts', '**/*.cli.test.ts'],
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.{ts,tsx}'],
    },
    // `pnpm test:coverage`: branches included, on the pure code only. Adapters and components are covered by
    // other families (the CLI's surface, real browsers, the example's build), types and ports have no runtime logic.
    // A report, never a threshold: a number to read, not a target to game.
    coverage: {
      provider: 'v8',
      include: ['packages/{core,facets,site,toc,messages,codegen,search}/src/**'],
      exclude: ['**/__tests__/**', '**/index.ts', '**/ports.ts'],
      reporter: ['text-summary', 'html', 'lcov'],
    },
    projects: [...packageProjects, { extends: true, test: { name: 'tooling', root: join(ROOT, 'tooling') } }],
  },
});

export default config;
