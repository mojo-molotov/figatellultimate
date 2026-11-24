// @vitest-environment happy-dom
// Which icon shows, with the stylesheet: only a real browser computes it (`pnpm test:browser`).
import '../styles.css';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ThemeToggle } from '../index.js';

const inBrowser = !navigator.userAgent.includes('HappyDOM');

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset['theme'];
});

describe('ThemeToggle, styled', () => {
  it.skipIf(!inBrowser)('shows what a click gives: the sun in the dark theme, the moon in the light one', () => {
    // Controlled with no theme yet: the page's theme alone decides, as before hydration.
    render(
      <ThemeToggle
        labels={{
          light: 'Thème clair, passer au thème sombre',
          dark: 'Thème sombre, passer au thème clair',
          unknown: 'Changer de thème',
        }}
        theme={undefined}
        onThemeChange={() => undefined}
      />,
    );
    const button = screen.getByRole('button', { name: /^Thème|^Changer/ });
    const shown = (): string[] =>
      ['theme-toggle-sun', 'theme-toggle-moon'].filter((slot) => {
        const icon = button.querySelector(`[data-slot="${slot}"]`);

        return icon !== null && getComputedStyle(icon).display !== 'none';
      });

    document.documentElement.dataset['theme'] = 'dark';
    expect(shown()).toEqual(['theme-toggle-sun']);
    document.documentElement.dataset['theme'] = 'light';
    expect(shown()).toEqual(['theme-toggle-moon']);
  });

  it.skipIf(!inBrowser)(
    'a click plays the orbit: the next icon rises, the other sets, then the button unblocks',
    async () => {
      // Precondition: the browser does not ask for reduced motion (the orbit is then off on purpose).
      expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(false);
      document.documentElement.dataset['theme'] = 'light';
      render(
        <ThemeToggle
          labels={{
            light: 'Thème clair, passer au thème sombre',
            dark: 'Thème sombre, passer au thème clair',
            unknown: 'Changer de thème',
          }}
        />,
      );
      const button = screen.getByRole('button', { name: /^Thème|^Changer/ });
      const icon = (slot: string): Element => button.querySelector(`[data-slot="${slot}"]`) ?? button;
      // The animations played, as they start: read later, a busy runner may find them already over (WebKit once read
      // no animation at all).
      const played: string[] = [];

      button.addEventListener('animationstart', (event) => {
        const slot = event.target instanceof Element ? event.target.getAttribute('data-slot') : null;

        played.push(`${slot ?? '?'} ${event.animationName}`);
      });
      // Whether it was blocked a while, as it happens.
      let blocked = false;
      const observer = new MutationObserver(() => {
        blocked ||= button.getAttribute('aria-disabled') === 'true';
      });

      observer.observe(button, { attributes: true, attributeFilter: ['aria-disabled'] });
      button.click();
      // To the dark theme: the sun (what a click now gives) rises, the moon sets.
      await waitFor(() => {
        expect(played).toEqual(
          expect.arrayContaining(['theme-toggle-sun fig-theme-rise', 'theme-toggle-moon fig-theme-set']),
        );
      });
      // Blocked from the click until the orbit and the page's transition end, then free.
      await waitFor(() => {
        expect(blocked && !button.hasAttribute('aria-disabled')).toBe(true);
      });
      observer.disconnect();
      expect(getComputedStyle(icon('theme-toggle-moon')).display).toBe('none');
    },
  );

  it.skipIf(!inBrowser || !('startViewTransition' in document))(
    'the page follows as a sunset: the night falls along a curved horizon over the dusk, the sky along it, then all is cleared',
    async () => {
      document.documentElement.dataset['theme'] = 'light';
      render(
        <ThemeToggle
          labels={{
            light: 'Thème clair, passer au thème sombre',
            dark: 'Thème sombre, passer au thème clair',
            unknown: 'Changer de thème',
          }}
        />,
      );
      screen.getByRole('button', { name: /^Thème|^Changer/ }).click();
      // The transition's own animations, on the root's view-transition pseudo-elements.
      await waitFor(() => {
        const names = document
          .getAnimations()
          .flatMap((animation) => (animation instanceof CSSAnimation ? [animation.animationName] : []));

        expect(names).toEqual(expect.arrayContaining(['fig-horizon', 'fig-dusk']));
      });
      expect(document.documentElement.dataset['themeSwitch']).toBe('to-dark');
      // The page holds still while it plays: no scrolling, its scrollbar's gutter kept.
      expect(getComputedStyle(document.documentElement).overflow).toBe('hidden');
      // The band of sky, on its own above both pages, gone once the switch ends.
      const horizon = document.body.querySelector('[data-slot="theme-horizon"]');

      expect(horizon === null ? '' : getComputedStyle(horizon).viewTransitionName).toBe('fig-theme-horizon');
      // The pressed toggle is captured on its own, live above the sweep: its orbit shows from start to end.
      expect(getComputedStyle(screen.getByRole('button', { name: /^Thème|^Changer/ })).viewTransitionName).toBe(
        'fig-theme-toggle',
      );
      await waitFor(() => {
        expect(document.documentElement.dataset['themeSwitch']).toBeUndefined();
      });
      expect(document.documentElement.dataset['theme']).toBe('dark');
      expect(document.body.querySelector('[data-slot="theme-horizon"]')).toBeNull();
      expect(getComputedStyle(document.documentElement).overflow).not.toBe('hidden');
    },
  );
});
