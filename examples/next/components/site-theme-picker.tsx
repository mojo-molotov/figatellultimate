'use client';

/**
 * The footer's theme picker: the design system's (`SiteThemePicker` of `@figatellultimate/ui`), the page blurring
 * from one theme to the other (`siteThemeTransition` of `@figatellultimate/effects`). A client component: the
 * transition, a function, is handed over here, never serialized from the server footer.
 */
import { siteThemeTransition } from '@figatellultimate/effects';
import { SiteThemePicker as Picker } from '@figatellultimate/ui';
import type { ReactNode } from 'react';

import { SITE_THEMES, type SiteTheme } from './site-themes';

/**
 * The picker, its texts formatted on the server.
 *
 * @param props - The group's name and each theme's.
 * @returns The picker over the site's themes.
 */
export function SiteThemePicker({
  label,
  names,
}: {
  readonly label: string;
  readonly names: Readonly<Record<SiteTheme, string>>;
}): ReactNode {
  return <Picker themes={SITE_THEMES} names={names} label={label} transition={siteThemeTransition} />;
}
