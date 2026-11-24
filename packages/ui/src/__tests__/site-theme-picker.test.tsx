// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SiteThemePicker } from '../index.js';
import { SITE_THEME_STORAGE_KEY, siteThemeScript } from '../scripts.js';

const THEMES = ['maquis', 'paper'] as const;
const NAMES = { maquis: '«Maquis»', paper: '«Papier»' };
const root = document.documentElement;

afterEach(() => {
  cleanup();
  delete root.dataset['siteTheme'];
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('siteThemeScript', () => {
  /** The script as the browser runs it in <head>. */
  const run = (script: string): void => {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- the inline script's own text, run as the page would (happy-dom runs no inline script).
    new Function(script)();
  };

  it('applies a remembered theme the site offers, before the first paint; anything else leaves the default', () => {
    localStorage.setItem(SITE_THEME_STORAGE_KEY, 'unknown');
    run(siteThemeScript(THEMES));
    expect(root.dataset['siteTheme']).toBeUndefined();
    localStorage.setItem(SITE_THEME_STORAGE_KEY, 'paper');
    run(siteThemeScript(THEMES));
    expect(root.dataset['siteTheme']).toBe('paper');
  });

  it('never throws without storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(() => {
      run(siteThemeScript(THEMES));
    }).not.toThrow();
  });
});

describe('SiteThemePicker', () => {
  const picker = (transition?: (apply: () => void) => void) =>
    render(
      <SiteThemePicker
        themes={THEMES}
        names={NAMES}
        label="«Thème»"
        {...(transition === undefined ? {} : { transition })}
      />,
    );

  it('names its group and shows the page’s theme pressed once mounted', async () => {
    root.dataset['siteTheme'] = 'paper';
    picker();

    expect(screen.getByRole('group', { name: '«Thème»' })).toBeDefined();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '«Papier»' }).getAttribute('aria-pressed')).toBe('true');
    });
    expect(screen.getByRole('button', { name: '«Maquis»' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('applies a theme through the transition it is given, and remembers it', async () => {
    const transition = vi.fn((apply: () => void) => {
      // Precondition: nothing applied before the transition runs it.
      expect(root.dataset['siteTheme']).toBeUndefined();
      apply();
    });

    picker(transition);
    await userEvent.click(screen.getByRole('button', { name: '«Papier»' }));

    expect(transition).toHaveBeenCalledTimes(1);
    expect(root.dataset['siteTheme']).toBe('paper');
    expect(localStorage.getItem(SITE_THEME_STORAGE_KEY)).toBe('paper');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '«Papier»' }).getAttribute('aria-pressed')).toBe('true');
    });
  });

  it('ignores the theme already shown, and works without storage', async () => {
    const transition = vi.fn((apply: () => void) => {
      apply();
    });

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    picker(transition);
    await userEvent.click(screen.getByRole('button', { name: '«Maquis»' }));
    expect(transition).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '«Papier»' }));
    expect(root.dataset['siteTheme']).toBe('paper');
  });
});
