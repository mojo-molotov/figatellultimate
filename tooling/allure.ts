/**
 * The Allure reporter shared by every vitest configuration: each test family writes its results to
 * `allure-results/`, labeled with its family, and `pnpm allure` renders one report of them all.
 *
 *     vitest.config.ts          (scenarios: every package, happy-dom, type tests) ──┐
 *     vitest.cli.config.ts      (cli: the built binary in real processes)          ├─> allure-results/ ──> allure-report/
 *     vitest.browser.config.ts  (browsers: Chromium, Firefox, WebKit)              │     (allurerc.mjs: history,
 *     vitest.lab.config.ts      (lab: the watch under bursts of changes)          ──┘      categories)
 *
 * Key design decisions:
 *     - One label per family (`layer`), set here rather than in each test: a test says what it checks, the
 *       configuration says what kind of test it is.
 *     - Suites come from the vitest projects (one per package) and the `describe` blocks: no Allure API in tests.
 *     - Matchers are not reported as steps: a `waitFor` retrying an assertion every 50 ms would record each attempt,
 *       and under load slow a test past its timeout.
 *     - CI publishes one report per family on GitHub Pages (`/ci/`, `/browsers/`, `/watch-lab/`), each in its own
 *       folder of the `allure-reports` branch with its own history: a weekly run never overwrites the CI's report
 *       (`.github/actions/allure-publish`).
 */
import { join } from 'node:path';

/** The test families, each run by its own vitest configuration. */
export type TestFamily = 'scenarios' | 'cli' | 'browsers' | 'lab';

/**
 * The Allure reporter entry of a vitest configuration's `reporters`.
 *
 * @param family - The family the configuration runs.
 * @returns The reporter and its options: results in the repository's `allure-results/` (wherever vitest runs), every
 *   result labeled with its family.
 *
 * @example
 * test: { reporters: ['default', allureReporter('cli')] }
 */
export function allureReporter(family: TestFamily): [
  string,
  {
    readonly resultsDir: string;
    readonly reportMatchers: boolean;
    readonly globalLabels: { name: string; value: string }[];
  },
] {
  return [
    'allure-vitest/reporter',
    {
      resultsDir: join(import.meta.dirname, '..', 'allure-results'),
      reportMatchers: false,
      globalLabels: [{ name: 'layer', value: family }],
    },
  ];
}
