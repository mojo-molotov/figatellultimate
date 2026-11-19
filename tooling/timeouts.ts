/**
 * The time a test, or one of its hooks, may take before vitest fails it: the same for every family, shared by every
 * vitest configuration.
 *
 * Key design decisions:
 *     - Generous: five minutes. A timeout is there to stop a test that hangs, never to judge how fast it runs: a CI
 *       runner under load once took 8 s for a typecheck and 5 s for an axe audit, past vitest's default of 5 s, and
 *       failed tests that were right. Speed has its own checks (the load test and its budgets).
 *     - Set here only, never on a single test: one test's lower timeout would cut it short again.
 *
 * Invariants (`__tests__/timeouts.test.ts`): every vitest configuration uses these; no test file gives a test or a
 * hook its own timeout.
 */

/** Five minutes for each test and each hook: stops a hang, never a slow runner. */
export const TEST_TIMEOUTS = { testTimeout: 300_000, hookTimeout: 300_000 } as const;
