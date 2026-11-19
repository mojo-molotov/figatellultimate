/**
 * The time a test, or one of its hooks, may take before vitest fails it: the same for every family, shared by every
 * vitest configuration.
 *
 * Key design decisions:
 *     - Generous: five minutes. A timeout is there to stop a test that hangs, never to judge how fast it runs: a CI
 *       runner under load once took 8 s for a typecheck and 5 s for an axe audit, past vitest's default of 5 s, and
 *       failed tests that were right. Speed has its own checks (the load test and its budgets).
 *     - Set here only, never on a single test: one test's lower timeout would cut it short again.
 *     - Waiting for the page to change (Testing Library's `waitFor` and `findBy…`) is generous too: thirty seconds,
 *       set for every test by `async-timeout.setup.ts`, instead of its default second, which a loaded runner missed
 *       while a dialog closed or a transition ended. A fixed pause before a single reading is a wait as well: it
 *       becomes a `waitFor`; a pause that checks nothing moved stays.
 *
 * Invariants (`__tests__/timeouts.test.ts`): every vitest configuration uses these, the DOM ones the setup; no test
 * file gives a test or a hook its own timeout, nor waits less than `ASYNC_TIMEOUT`.
 */

/** Five minutes for each test and each hook: stops a hang, never a slow runner. */
export const TEST_TIMEOUTS = { testTimeout: 300_000, hookTimeout: 300_000 } as const;

/** Thirty seconds for a wait on the page (`waitFor`, `findBy…`): never a slow runner either. */
export const ASYNC_TIMEOUT = 30_000;
