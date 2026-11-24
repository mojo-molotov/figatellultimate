import type { ReactNode } from 'react';
import { describe, expectTypeOf, it } from 'vitest';

import { ThemeToggle } from '../index.js';

const labels = {
  light: 'Thème clair, passer au thème sombre',
  dark: 'Thème sombre, passer au thème clair',
  unknown: 'Changer de thème',
};

describe('ThemeToggle: on its own, or controlled by a theme library', () => {
  it('takes the theme and its change together, or neither', () => {
    expectTypeOf(<ThemeToggle labels={labels} />).toExtend<ReactNode>();
    expectTypeOf(<ThemeToggle labels={labels} theme="dark" onThemeChange={() => undefined} />).toExtend<ReactNode>();
    // @ts-expect-error -- a theme without its change: the button could not switch it.
    expectTypeOf(<ThemeToggle labels={labels} theme="dark" />).toExtend<ReactNode>();
  });
});
