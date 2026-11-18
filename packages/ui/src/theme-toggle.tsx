'use client';

/**
 * The theme toggle: light or dark, the system's preference by default, the visitor's choice remembered.
 *
 * Key design decisions:
 *     - A click swaps the icons along an orbit (the stylesheet): the one leaving sets to the right, below the button's
 *       horizon, as the sun at dusk, while the other rises from the left. Only a click plays it (`data-switching`,
 *       while it runs): neither the page's load nor a change of the system's preference.
 *     - While it plays, the button is `aria-disabled` and ignores presses: it keeps the focus (a keyboard user stays on
 *       it), unlike `disabled`. It ends once the icons' animation and the page's transition both have (a press would
 *       otherwise cut the page's short), or after a while if neither runs (no stylesheet).
 *     - The whole page follows as a sunset or a sunrise (a view transition, `document.startViewTransition`): towards
 *       dark, the night falls from the top over the warming day; towards light, the day comes from the top too; the edge
 *       is a wide arc slowing as it nears, a band of sky along it (a layer of the new page, `data-slot="theme-horizon"`,
 *       removed once it ends). The
 *       stylesheet reads the way from `<html data-theme-switch="to-dark|to-light">`, set while it plays; the new
 *       page is captured once `<html data-theme>` shows the new theme (a theme library may set it a moment later).
 *       Without view transitions, the page changes at once.
 *     - On a desktop only (a mouse or a trackpad): on a touch screen, or with `prefers-reduced-motion`, no orbit, no
 *       sunset and never disabled; the theme simply changes.
 *
 * Invariants (`theme-toggle.test.tsx`, `theme-toggle-layout.test.tsx` in real browsers): its state, its storage
 * wrapped (a page without storage still works), controlled mode, the icon before hydration, the orbit played and
 * the presses ignored while it runs, the page's sunset or sunrise, none of them with reduced motion.
 */
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from 'react';

import { THEME_STORAGE_KEY as STORAGE_KEY } from './scripts.js';

/**
 * A switch ends after this long when nothing ends it (no stylesheet, no transition): longer than the page's
 * transition (1.6 s) and the orbit (600 ms), in the stylesheet.
 */
const SWITCH_FALLBACK_MS = 2500;

/**
 * Whether the switch animates: on a desktop (a mouse or a trackpad), motion allowed. A touch screen, or reduced
 * motion, changes the theme at once.
 */
const animates = (): boolean =>
  window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The longest a view transition waits for the page to show the new theme (a library sets it a moment later). */
const APPLIED_WITHIN_MS = 300;

/** Resolves once `<html data-theme>` shows `theme`, or after a while: the transition captures the new page then. */
function applied(theme: Theme): Promise<void> {
  return new Promise((resolve) => {
    if (currentTheme() === theme) {
      resolve();

      return;
    }

    const observer = new MutationObserver(() => {
      if (currentTheme() !== theme) return;

      observer.disconnect();
      clearTimeout(timer);
      resolve();
    });
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve();
    }, APPLIED_WITHIN_MS);

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  });
}

/** The page's latest view transition: only it clears the way it set on the root when it ends. */
let latest: ViewTransition | undefined;

/**
 * Switches the theme, the whole page following as a sunset (towards dark) or a sunrise (towards light) where view
 * transitions run and motion is allowed; at once otherwise. Resolves once the page's transition ends.
 */
function switchTo(theme: Theme, apply: () => void): Promise<void> {
  if (!animates() || !('startViewTransition' in document)) {
    apply();

    return Promise.resolve();
  }

  const root = document.documentElement;

  root.dataset['themeSwitch'] = theme === 'dark' ? 'to-dark' : 'to-light';
  // The band of sky along the horizon: a decorative layer of the new page only, above both pages while it plays.
  const horizon = document.createElement('div');

  horizon.dataset['slot'] = 'theme-horizon';
  horizon.setAttribute('aria-hidden', 'true');
  const transition = document.startViewTransition(async () => {
    apply();
    document.body.append(horizon);
    await applied(theme);
  });

  latest = transition;

  return transition.finished.finally(() => {
    horizon.remove();

    // A newer switch skipped this one: its way stays on the root for it.
    if (latest !== transition) return;

    latest = undefined;
    delete root.dataset['themeSwitch'];
  });
}

/** A color theme. */
export type Theme = 'light' | 'dark';

const listeners = new Set<() => void>();
const subscribe = (onChange: () => void): (() => void) => {
  listeners.add(onChange);
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  media.addEventListener('change', onChange);

  return () => {
    listeners.delete(onChange);
    media.removeEventListener('change', onChange);
  };
};

/** The theme in effect: the page's choice, else the system's preference. */
function currentTheme(): Theme {
  const chosen = document.documentElement.dataset['theme'];

  if (chosen === 'light' || chosen === 'dark') return chosen;

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function choose(theme: Theme): void {
  document.documentElement.dataset['theme'] = theme;

  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage may be unavailable (private mode, blocked): the choice holds for this page.
  }

  for (const listener of listeners) listener();
}

/** The toggle's own text. */
export interface ThemeToggleLabels {
  /** The button's accessible name, e.g. "Dark theme": pressed when the dark theme is on. */
  readonly dark: string;
}

interface ThemeToggleBase extends Omit<ComponentProps<'button'>, 'children' | 'onClick'> {
  readonly labels: ThemeToggleLabels;
}

/**
 * On its own (the page's `data-theme`, remembered, with `themeScript` of `@figatellu/ui/scripts`), or controlled by a theme library such as
 * next-themes: it then shows `theme` (`undefined` until the library knows it) and asks `onThemeChange` for the
 * other one, leaving the page's attribute and the storage to the library.
 */
export type ThemeToggleProps =
  | (ThemeToggleBase & { readonly theme?: never; readonly onThemeChange?: never })
  | (ThemeToggleBase & {
      readonly theme: Theme | undefined;
      readonly onThemeChange: (theme: Theme) => void;
    });

/**
 * Switches between the light and dark themes.
 *
 * @param props - The labels; optionally `theme` and `onThemeChange` together, to be controlled by a theme library
 *   (e.g. next-themes); and a button's props.
 * @returns A toggle button (`aria-pressed` in the dark theme). On its own, it starts from the system's preference,
 *   sets `<html data-theme>` and remembers the choice (with `themeScript` in the `<head>`, from the first paint);
 *   controlled, the library does both. Its icon is what a click gives (the sun in the dark theme), chosen by the
 *   stylesheet from the page's theme, right before hydration. A click swaps the icons along an orbit while the page
 *   follows as a sunset or a sunrise, the button `aria-disabled` until both end (neither on a touch screen nor with reduced motion).
 *
 * @example
 * <ThemeToggle labels={{ dark: 'Thème sombre' }} />
 * <ThemeToggle labels={{ dark: 'Dark theme' }} theme={resolvedTheme} onThemeChange={setTheme} />
 */
export function ThemeToggle({
  labels,
  theme: given,
  onThemeChange,
  onAnimationEnd,
  ...props
}: ThemeToggleProps): ReactNode {
  // The server cannot know the theme: the button renders unpressed, then follows the page once hydrated.
  const own = useSyncExternalStore<Theme | undefined>(subscribe, currentTheme, () => undefined);
  const theme = onThemeChange === undefined ? own : given;
  // While the orbit and the page's transition play: presses are ignored, so that none cuts the page's short.
  const [switching, setSwitching] = useState(false);
  const fallback = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Ends the orbit's wait: its icons' animation ended.
  const orbited = useRef<(() => void) | undefined>(undefined);
  const end = (): void => {
    clearTimeout(fallback.current);
    setSwitching(false);
  };

  useEffect(
    () => () => {
      clearTimeout(fallback.current);
    },
    [],
  );

  return (
    <button
      type="button"
      data-slot="theme-toggle"
      aria-label={labels.dark}
      aria-pressed={theme === 'dark'}
      data-theme={theme}
      {...(switching ? { 'aria-disabled': true, 'data-switching': '' } : {})}
      onClick={() => {
        if (switching) return;

        const next = (onThemeChange === undefined ? currentTheme() : theme) === 'dark' ? 'light' : 'dark';
        const page = switchTo(next, () => {
          if (onThemeChange === undefined) choose(next);
          else onThemeChange(next);
        });

        if (!animates()) return;

        setSwitching(true);
        fallback.current = setTimeout(end, SWITCH_FALLBACK_MS);
        const orbit = new Promise<void>((resolve) => {
          orbited.current = resolve;
        });

        // Free once both the orbit and the page's transition have ended (a transition skipped ends too).
        void Promise.allSettled([orbit, page]).then(end);
      }}
      onAnimationEnd={(event) => {
        onAnimationEnd?.(event);
        orbited.current?.();
      }}
      {...props}
    >
      {/* What a click gives: the sun in the dark theme, the moon in the light one, the stylesheet choosing by
          the page's theme, so that it is right from the first paint. */}
      <SunIcon data-slot="theme-toggle-sun" aria-hidden />
      <MoonIcon data-slot="theme-toggle-moon" aria-hidden />
    </button>
  );
}
