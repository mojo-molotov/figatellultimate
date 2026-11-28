// @vitest-environment happy-dom
// The inline scripts as data: a value the app passes can never close their <script> element.
import { afterEach, describe, expect, it } from 'vitest';

import { siteThemeScript, tocScript } from '../scripts.js';

/** A storage key that would close the element and open another, were it written as it is. */
const HOSTILE = '</script><script>document.title="injected"</script>';

/** The script as the browser runs it in <head>. */
const run = (script: string): void => {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- the inline script's own text, run as the page would (happy-dom runs no inline script).
  new Function(script)();
};
const root = document.documentElement;

afterEach(() => {
  delete root.dataset['toc'];
  delete root.dataset['siteTheme'];
  localStorage.clear();
});

describe('inline scripts', () => {
  it.each([
    [
      'tocScript',
      () => tocScript(HOSTILE),
      () => {
        localStorage.setItem(HOSTILE, 'closed');
      },
      () => root.dataset['toc'],
      'closed',
    ],
    [
      'siteThemeScript',
      () => siteThemeScript(['calanque', HOSTILE], HOSTILE),
      () => {
        localStorage.setItem(HOSTILE, 'calanque');
      },
      () => root.dataset['siteTheme'],
      'calanque',
    ],
  ])('%s never closes its element, and still reads the key it was given', (_, script, remember, applied, expected) => {
    expect(script()).toContain('script');
    expect(script().toLowerCase()).not.toContain('</');
    remember();
    run(script());
    expect(applied()).toBe(expected);
  });
});
