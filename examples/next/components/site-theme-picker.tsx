'use client';

/**
 * The footer's theme picker: one button per theme, the chosen one pressed, the choice remembered. The page
 * blurs, changes theme, then comes back sharp (a view transition, `<html data-site-theme-switch>` while it plays; the motion is
 * `@figatellultimate/themes/base.css`'s), at once on a touch screen, without view transitions or with reduced motion.
 *
 * The chosen option is shown from the first paint, before hydration: each button carries its theme (`value`), and
 * each theme's stylesheet marks its own option, read from `<html data-site-theme>`, which the `<head>`'s script sets
 * before the page shows. `aria-pressed`, known once mounted, then changes nothing on screen: no transition on load.
 */
import { useEffect, useState, type ReactNode } from 'react';

import { SITE_THEME_KEY, SITE_THEMES, type SiteTheme } from './site-themes';

const isTheme = (value: string | undefined): value is SiteTheme => SITE_THEMES.some((theme) => theme === value);

/** The page's latest blur: only it clears the mark it set on the root when it ends (a newer one skips it). */
let latest: ViewTransition | undefined;

/** Applies a theme, the page blurring from the old one to it where view transitions run and motion is allowed. */
function blurTo(apply: () => void): void {
  // On a desktop only (a mouse or a trackpad), motion allowed: a touch screen changes the theme at once.
  const desktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (
    !desktop ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    !('startViewTransition' in document)
  ) {
    apply();

    return;
  }

  const root = document.documentElement;

  root.dataset['siteThemeSwitch'] = '';
  const transition = document.startViewTransition(apply);

  latest = transition;
  void transition.finished.finally(() => {
    if (latest !== transition) return;

    latest = undefined;
    delete root.dataset['siteThemeSwitch'];
  });
}

/** The picker: the group's label and each theme's name, formatted on the server. */
export function SiteThemePicker({
  label,
  names,
}: {
  readonly label: string;
  readonly names: Readonly<Record<SiteTheme, string>>;
}): ReactNode {
  // The theme the page shows, read once mounted: the server cannot know the visitor's choice.
  const [current, setCurrent] = useState<SiteTheme | undefined>(undefined);

  useEffect(() => {
    const shown = document.documentElement.dataset['siteTheme'];

    setCurrent(isTheme(shown) ? shown : SITE_THEMES[0]);
  }, []);

  const choose = (theme: SiteTheme): void => {
    if (theme === current) return;

    blurTo(() => {
      document.documentElement.dataset['siteTheme'] = theme;
    });
    setCurrent(theme);

    try {
      localStorage.setItem(SITE_THEME_KEY, theme);
    } catch {
      // A convenience only: without storage, the choice lasts the visit.
    }
  };

  return (
    <div role="group" aria-label={label} data-slot="site-theme">
      <span data-slot="site-theme-label" aria-hidden>
        {label}
      </span>
      {SITE_THEMES.map((theme) => (
        <button
          key={theme}
          type="button"
          data-slot="site-theme-option"
          value={theme}
          aria-pressed={current === undefined ? undefined : current === theme}
          onClick={() => {
            choose(theme);
          }}
        >
          {names[theme]}
        </button>
      ))}
    </div>
  );
}
