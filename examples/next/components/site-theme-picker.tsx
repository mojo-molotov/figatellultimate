'use client';

/**
 * The footer's theme picker: the design system's (`SiteThemePicker` of `@figatellultimate/ui`), the page blurring
 * from one theme to the other (`siteThemeTransition` of `@figatellultimate/effects`). Non-default theme stylesheets
 * (`/themes/<name>.css`) are loaded lazily on hover/focus and awaited before the transition runs on click.
 */
import { siteThemeTransition } from '@figatellultimate/effects';
import { SiteThemePicker as Picker, type SiteThemeSpoken } from '@figatellultimate/ui';
import type { ReactNode } from 'react';

import { SITE_THEMES, type SiteTheme } from '../lib/site-themes';

const pending = new Map<SiteTheme, Promise<void>>();

/** Ensures a non-default theme's stylesheet is loaded into `<head>`, cached per theme. */
function ensureThemeStylesheet(theme: SiteTheme): Promise<void> {
  if (theme === SITE_THEMES[0]) return Promise.resolve();

  const existing = pending.get(theme);

  if (existing !== undefined) return existing;

  const current = [...document.head.children].find(
    (node): node is HTMLLinkElement => node instanceof HTMLLinkElement && node.dataset['siteThemeSheet'] === theme,
  );

  if (current !== undefined) {
    if (current.sheet !== null) return Promise.resolve();

    const wait = new Promise<void>((resolve) => {
      current.addEventListener('load', () => {
        resolve();
      });
      current.addEventListener('error', () => {
        resolve();
      });
    });

    pending.set(theme, wait);

    return wait;
  }

  const link = document.createElement('link');

  link.rel = 'stylesheet';
  link.href = `/themes/${theme}.css`;
  link.dataset['siteThemeSheet'] = theme;
  const load = new Promise<void>((resolve) => {
    link.addEventListener('load', () => {
      resolve();
    });
    link.addEventListener('error', () => {
      pending.delete(theme);
      resolve();
    });
  });

  pending.set(theme, load);
  document.head.append(link);

  return load;
}

/**
 * The picker, its texts formatted on the server.
 *
 * @param props - The group's name, each theme's, and each option's spoken names (`ui.theme.pick`).
 * @returns The picker over the site's themes.
 */
export function SiteThemePicker({
  label,
  names,
  spoken,
}: {
  readonly label: string;
  readonly names: Readonly<Record<SiteTheme, string>>;
  readonly spoken: Readonly<Record<SiteTheme, SiteThemeSpoken>>;
}): ReactNode {
  return (
    <Picker
      themes={SITE_THEMES}
      names={names}
      label={label}
      spoken={spoken}
      transition={siteThemeTransition}
      onPrefetch={(theme) => {
        void ensureThemeStylesheet(theme);
      }}
      prepare={ensureThemeStylesheet}
    />
  );
}
