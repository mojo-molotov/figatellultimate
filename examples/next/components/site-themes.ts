/**
 * The site's themes (`@figatellu/themes`): both loaded, one picked by `<html data-site-theme>`, the visitor's choice
 * remembered. A plain module: the layout (server) prints the script, the picker (client) reads the list.
 */

/** The themes the site offers, the first one by default. */
export const SITE_THEMES = ['maquis', 'paper'] as const;

/** A theme the site offers. */
export type SiteTheme = (typeof SITE_THEMES)[number];

/** Where the visitor's choice is remembered. */
export const SITE_THEME_KEY = 'figatellu-site-theme';

/**
 * The script for the `<head>`: it applies the remembered theme before the first paint, so that the page never
 * flashes the default one.
 *
 * @returns The script's text.
 */
export function siteThemeScript(): string {
  const themes = JSON.stringify(SITE_THEMES);

  return `try{var t=localStorage.getItem(${JSON.stringify(SITE_THEME_KEY)});if(${themes}.indexOf(t)>-1)document.documentElement.dataset.siteTheme=t}catch(e){}`;
}
