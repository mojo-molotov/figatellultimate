// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { siteThemeTransition } from '../index.js';

const root = document.documentElement;

/** The screen: a desktop (a mouse) or a touch screen, motion allowed or reduced. */
function screenIs(options: { readonly desktop: boolean; readonly reduced?: boolean }): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the part of MediaQueryList read.
      ({
        matches: query.includes('reduce') ? options.reduced === true : options.desktop,
      }) as MediaQueryList,
  );
}

/** A view transition whose end the test decides. */
function viewTransitions(): { readonly end: () => Promise<void> } {
  let end: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => {
    end = resolve;
  });

  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: (update: () => void) => {
      update();

      return { finished, ready: finished, updateCallbackDone: finished, skipTransition: () => undefined };
    },
  });

  return {
    end: async () => {
      end();
      await finished;
      await Promise.resolve();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'startViewTransition');
  delete root.dataset['siteThemeSwitch'];
});

describe('siteThemeTransition', () => {
  it('marks the page while the blur plays on a desktop, and clears the mark once it ends', async () => {
    screenIs({ desktop: true });
    const transitions = viewTransitions();
    const apply = vi.fn();

    siteThemeTransition(apply);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(root.dataset['siteThemeSwitch']).toBe('');
    await transitions.end();
    expect(root.dataset['siteThemeSwitch']).toBeUndefined();
  });

  it.each([
    ['on a touch screen', { desktop: false }],
    ['with reduced motion', { desktop: true, reduced: true }],
  ])('applies at once %s, the page never marked', (_, screen) => {
    screenIs(screen);
    viewTransitions();
    const apply = vi.fn();

    siteThemeTransition(apply);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(root.dataset['siteThemeSwitch']).toBeUndefined();
  });

  it('applies at once without view transitions', () => {
    screenIs({ desktop: true });
    const apply = vi.fn();

    siteThemeTransition(apply);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(root.dataset['siteThemeSwitch']).toBeUndefined();
  });
});
