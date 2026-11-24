'use client';

/**
 * The site theme picker: one button per theme (a stylesheet of `@figatellultimate/themes`, picked by
 * `<html data-site-theme>`), the chosen one pressed, the choice remembered.
 *
 * Key design decisions:
 *     - The chosen option is shown from the first paint, before hydration: each button carries its theme (`value`),
 *       and each theme's stylesheet marks its own option, read from `<html data-site-theme>`, which `siteThemeScript`
 *       sets before the page shows. `aria-pressed`, known once mounted, then changes nothing on screen.
 *     - The change goes through the app's `transition`, as chosen with the user: a look is decorative, out of the
 *       design system (`siteThemeTransition` of `@figatellultimate/effects` blurs the page); none applies at once.
 *     - Storage wrapped: without it, the choice lasts the visit.
 *     - Spoken names (`spoken`), as chosen with the user, said as the light and dark toggle says its own: the shown
 *       theme says what it is, another what a press does; nothing announced as pressed then. The current option is
 *       marked `data-current` for the stylesheet either way.
 *
 * Invariants (`site-theme-picker.test.tsx`): its group named, the page's theme pressed once mounted; a theme applied
 * through the transition and remembered; the theme shown ignored; a page without storage still works; the script
 * applying only a theme the site offers, never throwing; with spoken names, each option named by what it is or does,
 * by its theme alone before the theme is known.
 */
import { useSyncExternalStore, type ReactNode } from 'react';

import { SITE_THEME_STORAGE_KEY } from './scripts.js';

/** The theme `<html data-site-theme>` shows; the empty string for none, which no theme is. */
const siteTheme = (): string => document.documentElement.dataset['siteTheme'] ?? '';

/** Follows `<html data-site-theme>`: the picker, the script or another tab may change it. */
const subscribe = (onChange: () => void): (() => void) => {
  const observer = new MutationObserver(onChange);

  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-site-theme'] });

  return () => {
    observer.disconnect();
  };
};

/** What `SiteThemePicker` takes. */
export interface SiteThemePickerProps<T extends string> {
  /** The themes the site offers, the first one by default. */
  readonly themes: readonly T[];
  /** Each theme's name, its button's text. */
  readonly names: Readonly<Record<T, string>>;
  /** The group's name, shown before the buttons. */
  readonly label: string;
  /** Where the choice is remembered; the same as `siteThemeScript`'s. Default `SITE_THEME_STORAGE_KEY`. */
  readonly storageKey?: string | undefined;
  /** How the change is applied, e.g. `siteThemeTransition` of `@figatellultimate/effects`; default at once. */
  readonly transition?: ((apply: () => void) => void) | undefined;
  /**
   * Each option's spoken names, as a light and dark toggle says them: `on` while its theme is shown ("Maquis theme,
   * current"), `choose` while another is ("Switch to the Paper theme"), `unknown` before the theme is known (the
   * prerendered page). Given, nothing is announced as pressed: the names say it. Default: `names`, pressed.
   */
  readonly spoken?: Readonly<Record<T, SiteThemeSpoken>> | undefined;
}

/** An option's spoken names (`SiteThemePickerProps['spoken']`). */
export interface SiteThemeSpoken {
  readonly on: string;
  readonly choose: string;
  readonly unknown: string;
}

/**
 * The site theme picker.
 *
 * @param props - The themes, their names, the group's name, and how a change is applied.
 * @returns A group of buttons, `data-slot="site-theme"`, each option `data-slot="site-theme-option"`.
 *
 * @example
 * <SiteThemePicker themes={['maquis', 'paper']} names={names} label="Theme" transition={siteThemeTransition} />
 */
export function SiteThemePicker<T extends string>({
  themes,
  names,
  label,
  storageKey = SITE_THEME_STORAGE_KEY,
  transition = (apply) => {
    apply();
  },
  spoken,
}: SiteThemePickerProps<T>): ReactNode {
  // The theme the page shows, read once mounted (the server cannot know the visitor's choice), followed as it changes.
  const shown = useSyncExternalStore(subscribe, siteTheme, () => undefined);
  const current = shown === undefined ? undefined : (themes.find((theme) => theme === shown) ?? themes[0]);

  const choose = (theme: T): void => {
    if (theme === current) return;

    transition(() => {
      document.documentElement.dataset['siteTheme'] = theme;
    });

    try {
      localStorage.setItem(storageKey, theme);
    } catch {
      // A convenience only: without storage, the choice lasts the visit.
    }
  };

  return (
    <div role="group" aria-label={label} data-slot="site-theme">
      <span data-slot="site-theme-label" aria-hidden>
        {label}
      </span>
      {themes.map((theme) => (
        <button
          key={theme}
          type="button"
          data-slot="site-theme-option"
          value={theme}
          {...(spoken === undefined
            ? { 'aria-pressed': current === undefined ? undefined : current === theme }
            : {
                'aria-label':
                  current === undefined
                    ? spoken[theme].unknown
                    : current === theme
                      ? spoken[theme].on
                      : spoken[theme].choose,
              })}
          {...(current === theme ? { 'data-current': '' } : {})}
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
