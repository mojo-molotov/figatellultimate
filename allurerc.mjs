// Allure Report 3 configuration, read by `allure generate` (`pnpm allure`, and CI's allure-publish action).
// A plain object, not `defineConfig` from "allure": the CLI loads this file, which then imports nothing but Node's
// own modules. Its values
// that mirror the repository (the layers, the CI matrix) are checked against it by `tooling/__tests__/allure.test.ts`.
//
// - `historyPath`: one JSONL file appended on every generation; CI keeps one per test family on the
//   `allure-reports` branch (`.github/actions/allure-publish`), so trends span builds without mixing families.
// - `historyLimit`: the last 5 runs only, enough for a trend. A CI run merges six environments, about 12 MB of
//   history each: kept forever, the file passed GitHub's 100 MB limit after a dozen runs. Stored compressed (about
//   1 MB a run).
// - `environments`: one per OS and Node version of the CI matrix, matched by the `os` and `node` labels the
//   reporter gives every result in CI (`tooling/allure.ts`); a local run has neither, and one environment.
// - `variables`: the run the report comes from (commit, branch, trigger, its page), from GitHub Actions' variables.
// - `groupBy`: the tree by behavior, epic (a product domain), feature (a package), story (a describe), as
//   `tooling/allure-behaviors.ts` labels every test. Without it, the tree follows suites: a whole family whose tests
//   share one package (the browsers', the watch lab's) was one group.
// - `charts`: Allure's default charts, the testing pyramid drawn with this repository's four layers, base first
//   (`tooling/allure-behaviors.ts`). Giving `charts` replaces the defaults, so they are all listed.
// - `categories`: failures sorted by kind, the way they are read.

import { env } from 'node:process';

const OS = { linux: 'Linux', darwin: 'macOS', win32: 'Windows' };
const NODES = ['24', '26'];

const has = (labels, name, value) => labels.some((label) => label.name === name && label.value === value);

const environments = Object.fromEntries(
  Object.entries(OS).flatMap(([id, os]) =>
    NODES.map((node) => [
      `${id}-node-${node}`,
      { name: `${os} · Node ${node}`, matcher: ({ labels }) => has(labels, 'os', os) && has(labels, 'node', node) },
    ]),
  ),
);

const run =
  env.GITHUB_RUN_ID === undefined
    ? { Run: 'local' }
    : {
        Commit: (env.GITHUB_SHA ?? '').slice(0, 7),
        Branch: env.GITHUB_REF_NAME ?? '',
        Trigger: env.GITHUB_EVENT_NAME ?? '',
        Workflow: env.GITHUB_WORKFLOW ?? '',
        Run: `${env.GITHUB_SERVER_URL ?? ''}/${env.GITHUB_REPOSITORY ?? ''}/actions/runs/${env.GITHUB_RUN_ID}`,
      };

export const LAYERS = ['unit', 'component', 'integration', 'e2e'];

const stability = (groupBy) => ({
  type: 'stabilityDistribution',
  title: `Stability distribution by ${groupBy === 'story' ? 'stories' : `${groupBy}s`}`,
  skipStatuses: ['skipped', 'unknown'],
  threshold: 90,
  groupBy,
});

export default {
  name: 'figatellultimate',
  output: 'allure-report',
  historyPath: './history.jsonl',
  historyLimit: 5,
  environments,
  variables: run,
  plugins: {
    awesome: {
      options: {
        reportName: 'figatellultimate',
        groupBy: ['epic', 'feature', 'story'],
        charts: [
          { type: 'currentStatus', title: 'Current status' },
          { type: 'statusDynamics', title: 'Status dynamics' },
          {
            type: 'testResultSeverities',
            title: 'Test results by severities',
            levels: ['blocker', 'critical', 'normal', 'minor', 'trivial'],
            statuses: ['passed', 'failed', 'broken', 'skipped', 'unknown'],
            includeUnset: true,
          },
          { type: 'statusTransitions', title: 'Status transitions' },
          { type: 'testBaseGrowthDynamics', title: 'Test base growth dynamics' },
          { type: 'coverageDiff', title: 'Coverage diff map' },
          { type: 'successRateDistribution', title: 'Success rate distribution' },
          { type: 'problemsDistribution', by: 'environment', title: 'Problems distribution by environment' },
          stability('feature'),
          stability('epic'),
          stability('story'),
          { type: 'durations', title: 'Durations histogram', groupBy: 'none' },
          { type: 'durations', title: 'Durations by layer histogram', groupBy: 'layer' },
          { type: 'durationDynamics', title: 'Durations dynamics' },
          { type: 'statusAgePyramid', title: 'Status age pyramid' },
          { type: 'testingPyramid', title: 'Testing pyramid', layers: LAYERS },
        ],
      },
    },
  },
  categories: {
    rules: [
      { name: 'Test defects', matchers: { statuses: ['broken'] } },
      { name: 'Type errors', matchers: { statuses: ['failed'], message: /TypeCheckError|Type '/ } },
      { name: 'Assertion errors', matchers: { statuses: ['failed'], message: /AssertionError|expected/ } },
      { name: 'Skipped', matchers: { statuses: ['skipped'] } },
    ],
  },
};
