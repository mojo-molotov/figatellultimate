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
      stylesheetBase="/themes/"
    />
  );
}
