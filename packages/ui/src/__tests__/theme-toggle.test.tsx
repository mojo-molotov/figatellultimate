// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeToggle } from '../index.js';
import { themeScript } from '../scripts.js';

const LABELS = { dark: '«thème sombre»' };
const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
/** happy-dom does not run inline scripts: the script itself is run in real browsers (`pnpm test:browser`). */
const inBrowser = !navigator.userAgent.includes('HappyDOM');

/**
 * The page's view transition, at once: these tests check the toggle, not the animation (`theme-toggle-layout.test.tsx`
 * plays it in real browsers); a real one would outlive its test and switch the theme during the next.
 */
const immediate = (update: () => Promise<void>) => {
  const done = update();

  return { finished: done, ready: done, updateCallbackDone: done, skipTransition: () => undefined };
};

beforeEach(() => {
  delete document.documentElement.dataset['theme'];
  localStorage.clear();
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: immediate });
});
afterEach(() => {
  cleanup();
  delete document.documentElement.dataset['theme'];
  delete document.documentElement.dataset['themeSwitch'];
  localStorage.clear();
  Reflect.deleteProperty(document, 'startViewTransition');
});

describe('ThemeToggle', () => {
  it('is a toggle button named by its label, pressed when the dark theme is on, and passes axe', async () => {
    render(<ThemeToggle labels={LABELS} />);
    const button = screen.getByRole('button', { name: '«thème sombre»' });

    expect(button.getAttribute('aria-pressed')).toBe(String(systemDark));
    const result = await axe.run(document.body, { rules: { region: { enabled: false } } });

    expect(result.violations).toEqual([]);
  });

  it('switches the theme on <html>, remembers it, and follows it (keyboard: Enter, Space)', async () => {
    const user = userEvent.setup();

    render(<ThemeToggle labels={LABELS} />);
    const button = screen.getByRole('button', { name: '«thème sombre»' });
    const start = systemDark ? 'dark' : 'light';
    const other = systemDark ? 'light' : 'dark';

    button.focus();
    await user.keyboard('{Enter}');
    // Where view transitions run, the theme switches inside the page's transition, a frame later.
    await waitFor(() => {
      expect(document.documentElement.dataset['theme']).toBe(other);
    });
    expect(localStorage.getItem('figatellultimate-theme')).toBe(other);
    expect(button.getAttribute('aria-pressed')).toBe(String(other === 'dark'));
    // The orbit played and the page's transition ended: Space switches back.
    await act(async () => {
      fireEvent.animationEnd(button);
      await Promise.resolve();
    });
    await user.keyboard(' ');
    await waitFor(() => {
      expect(document.documentElement.dataset['theme']).toBe(start);
    });
  });

  it('ignores presses while its orbit plays, keeping the focus, until the animation ends', async () => {
    const user = userEvent.setup();

    render(<ThemeToggle labels={LABELS} />);
    const button = screen.getByRole('button', { name: '«thème sombre»' });
    const other = systemDark ? 'light' : 'dark';

    // Precondition: the environment does not ask for reduced motion (the orbit is then off on purpose).
    expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(false);
    await user.click(button);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.hasAttribute('data-switching')).toBe(true);
    await user.click(button);
    expect(document.documentElement.dataset['theme']).toBe(other);
    expect(document.activeElement).toBe(button);
    await act(async () => {
      fireEvent.animationEnd(button);
      await Promise.resolve();
    });
    expect(button.hasAttribute('aria-disabled')).toBe(false);
    expect(button.hasAttribute('data-switching')).toBe(false);
  });

  it('the page follows as a sunset or a sunrise: a view transition, its way on <html> while it plays', async () => {
    const ways: string[] = [];
    let finish = (): void => undefined;
    const fake = (update: () => Promise<void>) => {
      ways.push(document.documentElement.dataset['themeSwitch'] ?? '');
      const done = update();

      return {
        updateCallbackDone: done,
        ready: done,
        finished: done.then(
          () =>
            new Promise<void>((resolve) => {
              finish = resolve;
            }),
        ),
        skipTransition: () => undefined,
      };
    };

    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: fake });

    try {
      render(<ThemeToggle labels={LABELS} />);
      const button = screen.getByRole('button', { name: '«thème sombre»' });
      const other = systemDark ? 'light' : 'dark';

      fireEvent.click(button);
      // The way, set before the old page is captured; the theme switched inside the transition.
      expect(ways).toEqual([other === 'dark' ? 'to-dark' : 'to-light']);
      await act(async () => {
        await Promise.resolve();
      });
      expect(document.documentElement.dataset['theme']).toBe(other);
      expect(document.documentElement.dataset['themeSwitch']).toBe(other === 'dark' ? 'to-dark' : 'to-light');
      await act(async () => {
        finish();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(document.documentElement.dataset['themeSwitch']).toBeUndefined();
    } finally {
      Reflect.deleteProperty(document, 'startViewTransition');
    }
  });

  it('a switch that skips a running one keeps its own way on <html> (two toggles on the page)', async () => {
    const ends: (() => void)[] = [];
    const pending = (update: () => Promise<void>) => {
      const done = update();

      return {
        updateCallbackDone: done,
        ready: done,
        finished: done.then(() => new Promise<void>((resolve) => ends.push(resolve))),
        skipTransition: () => undefined,
      };
    };

    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: pending });
    render(
      <>
        <ThemeToggle labels={LABELS} />
        <ThemeToggle labels={{ dark: '«autre bouton»' }} />
      </>,
    );
    // The first one switches; the other one switches back while the first transition still plays.
    fireEvent.click(screen.getByRole('button', { name: '«thème sombre»' }));
    fireEvent.click(screen.getByRole('button', { name: '«autre bouton»' }));
    const way = document.documentElement.dataset['themeSwitch'];

    // The first one ends (skipped by the second): the second one's way stays.
    await act(async () => {
      ends[0]?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.documentElement.dataset['themeSwitch']).toBe(way);
    await act(async () => {
      ends[1]?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.documentElement.dataset['themeSwitch']).toBeUndefined();
  });

  it('stays held until the page transition ends too, after its orbit', async () => {
    let finish = (): void => undefined;
    const slow = (update: () => Promise<void>) => {
      const done = update();

      return {
        updateCallbackDone: done,
        ready: done,
        finished: done.then(
          () =>
            new Promise<void>((resolve) => {
              finish = resolve;
            }),
        ),
        skipTransition: () => undefined,
      };
    };

    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: slow });
    render(<ThemeToggle labels={LABELS} />);
    const button = screen.getByRole('button', { name: '«thème sombre»' });

    fireEvent.click(button);
    await act(async () => {
      fireEvent.animationEnd(button);
      await Promise.resolve();
    });
    // The orbit ended, the page's transition still plays: still held.
    expect(button.getAttribute('aria-disabled')).toBe('true');
    await act(async () => {
      finish();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(button.hasAttribute('aria-disabled')).toBe(false);
  });

  it('on a touch screen: no orbit, no sunset, never disabled', () => {
    const matchMedia = window.matchMedia.bind(window);
    const spy = vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
      const list = matchMedia(query);

      // A finger, no mouse: the desktop query does not match.
      if (query === '(hover: hover) and (pointer: fine)') Object.defineProperty(list, 'matches', { value: false });

      return list;
    });
    const transition = vi.fn();

    try {
      Object.defineProperty(document, 'startViewTransition', { configurable: true, value: transition });
      render(<ThemeToggle labels={LABELS} />);
      const button = screen.getByRole('button', { name: '«thème sombre»' });
      const other = systemDark ? 'light' : 'dark';

      fireEvent.click(button);
      expect(button.hasAttribute('aria-disabled')).toBe(false);
      expect(transition).not.toHaveBeenCalled();
      // The theme changes at once.
      expect(document.documentElement.dataset['theme']).toBe(other);
    } finally {
      spy.mockRestore();
    }
  });

  it('unblocks by itself when no animation ends it (no stylesheet)', () => {
    vi.useFakeTimers();

    try {
      render(<ThemeToggle labels={LABELS} />);
      const button = screen.getByRole('button', { name: '«thème sombre»' });

      fireEvent.click(button);
      expect(button.getAttribute('aria-disabled')).toBe('true');
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(button.hasAttribute('aria-disabled')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('with reduced motion: no orbit, no sunset, never disabled', () => {
    const matchMedia = window.matchMedia.bind(window);
    const spy = vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
      const list = matchMedia(query);

      // The visitor asks for reduced motion: this query matches, the others answer as the environment does.
      if (query === '(prefers-reduced-motion: reduce)') Object.defineProperty(list, 'matches', { value: true });

      return list;
    });

    try {
      render(<ThemeToggle labels={LABELS} />);
      const button = screen.getByRole('button', { name: '«thème sombre»' });
      const start = document.documentElement.dataset['theme'];

      const transition = vi.fn();

      Object.defineProperty(document, 'startViewTransition', { configurable: true, value: transition });
      fireEvent.click(button);
      expect(button.hasAttribute('aria-disabled')).toBe(false);
      // No sunset either: the theme changes at once.
      expect(transition).not.toHaveBeenCalled();
      Reflect.deleteProperty(document, 'startViewTransition');
      fireEvent.click(button);
      expect(document.documentElement.dataset['theme']).not.toBe(undefined);
      expect(document.documentElement.dataset['theme']).toBe(start ?? (systemDark ? 'dark' : 'light'));
    } finally {
      spy.mockRestore();
    }
  });

  it.skipIf(!inBrowser)(
    'themeScript applies a remembered choice before the first paint, and ignores anything else',
    () => {
      /** The script as the app puts it in <head>. */
      const run = (): void => {
        const script = document.createElement('script');

        script.textContent = themeScript;
        document.head.append(script);
        script.remove();
      };

      localStorage.setItem('figatellultimate-theme', 'dark');
      run();
      expect(document.documentElement.dataset['theme']).toBe('dark');
      delete document.documentElement.dataset['theme'];
      localStorage.setItem('figatellultimate-theme', '<script>');
      run();
      expect(document.documentElement.dataset['theme']).toBeUndefined();
    },
  );

  it('themeScript only accepts light or dark, and never throws (storage may be blocked)', () => {
    expect(themeScript).toContain("t==='light'||t==='dark'");
    expect(themeScript.startsWith('try{')).toBe(true);
  });

  it('draws a sun and a moon (heroicons), both hidden from assistive technologies', () => {
    render(<ThemeToggle labels={LABELS} />);
    const button = screen.getByRole('button', { name: '«thème sombre»' });

    for (const slot of ['theme-toggle-sun', 'theme-toggle-moon']) {
      const icon = button.querySelector(`[data-slot="${slot}"]`);

      expect(icon?.tagName.toLowerCase()).toBe('svg');
      expect(icon?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('renders no text of its own: its only name is the label', () => {
    render(<ThemeToggle labels={LABELS} />);
    expect(document.body.textContent.trim()).toBe('');
  });

  it('controlled by a theme library (next-themes): it shows the given theme and asks for the other one', async () => {
    const user = userEvent.setup();
    const onThemeChange = vi.fn();
    const { rerender } = render(<ThemeToggle labels={LABELS} theme="dark" onThemeChange={onThemeChange} />);
    const button = screen.getByRole('button', { name: '«thème sombre»' });

    expect(button.getAttribute('aria-pressed')).toBe('true');
    await user.click(button);
    await waitFor(() => {
      expect(onThemeChange).toHaveBeenCalledWith('light');
    });
    // The library owns the page's attribute and the storage: the toggle touches neither.
    expect(document.documentElement.dataset['theme']).toBeUndefined();
    expect(localStorage.length).toBe(0);
    rerender(<ThemeToggle labels={LABELS} theme="light" onThemeChange={onThemeChange} />);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    // Before the library knows the theme (server rendering): not pressed.
    rerender(<ThemeToggle labels={LABELS} theme={undefined} onThemeChange={onThemeChange} />);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });
});
