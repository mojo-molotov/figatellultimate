/**
 * allure-vitest's one false alarm in real browsers, silenced: it instruments every `expect` to make it a report's step,
 * and an `expect` run by a `waitFor` (polled every 50 ms) finds no test to attach to, so each poll printed
 * "no vitest context is detected" (thousands a run, burying the warnings that matter). That message alone is dropped;
 * every other error still prints. Set in the browser configuration.
 */
const MISSING_CONTEXT = 'no vitest context is detected.';
const error = console.error.bind(console);

console.error = (...args: unknown[]): void => {
  if (typeof args[0] === 'string' && args[0].startsWith(MISSING_CONTEXT)) return;

  error(...args);
};
