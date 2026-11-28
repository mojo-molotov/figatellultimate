/**
 * The site's themes (`@figatellultimate/themes`): the default loaded upfront, the others fetched lazily via
 * `/themes/<name>.css`, one picked by `<html data-site-theme>`, the visitor's choice remembered (`siteThemeScript`
 * and `SiteThemePicker` of `@figatellultimate/ui`). A plain module: the layout (server) prints the script, the picker
 * (client) reads the list.
 */

/** The themes the site offers, the first one by default. */
export const SITE_THEMES = ['maquis', 'calanque', 'scandola'] as const;

/** A theme the site offers. */
export type SiteTheme = (typeof SITE_THEMES)[number];
