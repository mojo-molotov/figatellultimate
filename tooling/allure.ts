/**
 * The Allure reporter shared by every vitest configuration: each test family writes its results to
 * `allure-results/`, every test labeled with its behavior, layer, severity and tags, and `pnpm allure` renders one
 * report of them all.
 *
 *     vitest.config.ts          (scenarios: every package, happy-dom, type tests) ──┐
 *     vitest.cli.config.ts      (cli: the built binary in real processes)          ├─> allure-results/ ──> allure-report/
 *     vitest.browser.config.ts  (browsers: Chromium, Firefox, WebKit)              │     (allurerc.mjs: history,
 *     vitest.lab.config.ts      (lab: the watch under bursts of changes)          ──┘      environments, charts)
 *
 *     run end ──> each test: labelsOf(family, file, outermost describe, role) ──> its metadata ──> allure-vitest
 *
 * Key design decisions:
 *     - Labels are deduced once the run ends, on the Node side, then handed to allure-vitest as each test's metadata:
 *       type tests (checked by `tsc`, no setup file runs) and browser tests are labeled like any other, and tests never
 *       call Allure (`allure-behaviors.ts`).
 *     - allure-vitest's reporter is wrapped, not subclassed: the wrapper adds the labels, then hands the run on.
 *     - In CI, each result carries its runner's `os` and `node`: `allurerc.mjs` turns them into one environment per
 *       OS and Node version of the matrix. Locally, none: the report has one environment.
 *     - Suites come from the vitest projects (one per package) and the `describe` blocks.
 *     - Matchers are not reported as steps: a `waitFor` retrying an assertion every 50 ms would record each attempt,
 *       and under load slow a test past its timeout.
 *     - CI publishes one report per family on GitHub Pages (`/ci/`, `/browsers/`, `/watch-lab/`), each in its own
 *       folder of the `allure-reports` branch with its own history: a weekly run never overwrites the CI's report
 *       (`.github/actions/reports-publish`).
 *
 * Invariants (`__tests__/allure.test.ts`): every test of a run gets its labels, added to what it already reported;
 * the environments of `allurerc.mjs` cover the CI matrix.
 */
import { join, relative, sep } from 'node:path';

import AllureVitestReporter from 'allure-vitest/reporter';
import type { Reporter } from 'vitest/node';

import { labelsOf, type Label, type TestFamily } from './allure-behaviors.ts';
import { discoverPackages, type Role } from './boundaries/roles.ts';

export type { TestFamily } from './allure-behaviors.ts';

const ROOT = join(import.meta.dirname, '..');

/** The key under which allure-vitest reads a test's runtime messages. */
const MESSAGES = 'allureRuntimeMessages';

/** The operating systems of the CI matrix, as the report names them. */
export const OS_NAMES: Readonly<Record<string, string>> = { linux: 'Linux', win32: 'Windows' };

/** A suite or module of a run, as far as labeling goes. */
interface ParentShape {
  readonly type: string;
  readonly name?: string;
  readonly parent?: ParentShape;
}

/** A test of a run, as far as labeling goes: vitest's `TestCase` has this shape. */
export interface TestShape {
  readonly module: { readonly moduleId: string };
  readonly parent: ParentShape;
  meta(): object;
}

/** A test module of a run: vitest's `TestModule` has this shape. */
export interface ModuleShape {
  readonly children: { allTests(): Iterable<TestShape> };
}

/** The outermost `describe` around a test. */
function outermost(test: TestShape): string | undefined {
  let name: string | undefined;

  for (let parent: ParentShape | undefined = test.parent; parent?.type === 'suite'; parent = parent.parent) {
    name = parent.name;
  }

  return name;
}

/**
 * Adds each test's labels to the metadata it reported, for allure-vitest to write. An injection seam for the tests,
 * not an API.
 *
 * @param modules - The run's test modules.
 * @param family - The family the run belongs to.
 * @param roles - Each package folder's role.
 * @param root - The repository's root, test files being reported by absolute path.
 * @returns Once every test of the run is labeled.
 */
export function labelRun(
  modules: Iterable<ModuleShape>,
  family: TestFamily,
  roles: Readonly<Record<string, Role>>,
  root: string,
): void {
  for (const module of modules) {
    for (const test of module.children.allTests()) {
      const file = relative(root, test.module.moduleId).split(sep).join('/');
      const role = roles[/^packages\/([^/]+)\//.exec(file)?.[1] ?? ''];
      const labels: Label[] = labelsOf({ family, file, describe: outermost(test), role });
      const meta = test.meta();
      const reported: unknown = Reflect.get(meta, MESSAGES);
      const previous: readonly unknown[] = Array.isArray(reported) ? reported : [];

      Reflect.set(meta, MESSAGES, [...previous, { type: 'metadata', data: { labels } }]);
    }
  }
}

/** The labels every result of this process carries: in CI, the runner's OS and Node version; none locally. */
function runnerLabels(): Label[] {
  const ci = process.env['CI'];

  if (ci === undefined || ci === '') return [];

  return [
    { name: 'os', value: OS_NAMES[process.platform] ?? process.platform },
    { name: 'node', value: process.versions.node.split('.')[0] ?? process.versions.node },
  ];
}

/**
 * The Allure reporter of a vitest configuration's `reporters`.
 *
 * @param family - The family the configuration runs.
 * @returns A reporter writing to the repository's `allure-results/` (wherever vitest runs): every result labeled
 *   with its family, its behavior, layer, severity and tags, and in CI its runner's OS and Node version.
 *
 * @example
 * test: { reporters: ['default', allureReporter('cli')] }
 */
export function allureReporter(family: TestFamily): Reporter {
  const allure = new AllureVitestReporter({
    resultsDir: join(ROOT, 'allure-results'),
    reportMatchers: false,
    globalLabels: runnerLabels(),
  });
  const roles = Object.fromEntries(discoverPackages(ROOT).map((pkg) => [pkg.dir.replace(/^packages\//, ''), pkg.role]));

  return {
    onInit: (vitest) => {
      allure.onInit(vitest);
    },
    onTestRunEnd: (modules) => {
      labelRun(modules, family, roles, ROOT);
      allure.onTestRunEnd(modules);
    },
  };
}
