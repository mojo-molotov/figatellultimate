/**
 * `@figatellultimate/ui/scripts`: the inline scripts a page puts in its `<head>`, run before the first paint, so that a
 * remembered choice (the theme, the site's theme, a closed table of contents) never flashes on load, and a navbar
 * that does not fit is compact from the first paint.
 *
 * Key design decisions:
 *     - An entry of its own, without `'use client'`: a server component (a root layout) calls these, which it cannot do
 *       through the client components' entry.
 *     - A value the app passes is written as a literal with `<` escaped: whatever it holds, it never closes the
 *       `<script>` element (`scripts.test.ts`).
 */

/**
 * A value as a script literal that can never close its `<script>` element: `<` written `\u003c`, which reads the same.
 */
const literal = (value: unknown): string => JSON.stringify(value).replaceAll('<', '\\u003c');

/** Where `ThemeToggle` remembers the visitor's theme (a per-visitor convenience). */
export const THEME_STORAGE_KEY = 'figatellultimate-theme';

/** Where `TableOfContents` remembers the visitor's choice by default. */
export const TOC_STORAGE_KEY = 'figatellultimate:toc';

/**
 * The inline script that applies the remembered theme before the first paint, so that a dark choice never flashes
 * light; without a stored choice, it does nothing (the stylesheet follows the system).
 *
 * @example
 * <script dangerouslySetInnerHTML={{ __html: themeScript }} />
 */
export const themeScript: string = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

/**
 * The inline script that closes the table of contents before the first paint, when the visitor closed it.
 *
 * @param storageKey - Where the component stores the choice; the same as its `storageKey`.
 * @returns The script's text, for a `<script>` in the `<head>`: it marks `<html data-toc="closed">`, so that the
 *   prerendered page shows it closed and it never slides shut on hydration.
 *
 * @example
 * <script dangerouslySetInnerHTML={{ __html: tocScript() }} />
 */
export function tocScript(storageKey: string = TOC_STORAGE_KEY): string {
  return `try{if(localStorage.getItem(${literal(storageKey)})==='closed')document.documentElement.dataset.toc='closed'}catch(e){}`;
}

/**
 * The inline script that makes a navbar compact before the first paint when its links do not fit on one line, so that
 * the page never shows it on two lines, nor switches its layout once hydrated. `Navbar` measures the same way after,
 * as its room changes.
 *
 * Put it right after the navbar (a `<script>` in the header): it measures the navbars already in the page, their
 * stylesheet loaded (a parser's script waits for it).
 *
 * @example
 * <header><HeaderBar … /><script dangerouslySetInnerHTML={{ __html: navbarScript }} /></header>
 */
export const navbarScript: string = `try{document.querySelectorAll('[data-slot="navbar"]').forEach(function(n){n.setAttribute('data-measuring','');var o=n.scrollWidth>n.clientWidth+1;n.removeAttribute('data-measuring');if(o)n.setAttribute('data-compact','');else n.removeAttribute('data-compact')})}catch(e){}`;

/** Where `SiteThemePicker` remembers the visitor's site theme by default. */
export const SITE_THEME_STORAGE_KEY = 'figatellultimate-site-theme';

/**
 * The inline script that applies the remembered site theme (a stylesheet of `@figatellultimate/themes`, picked by
 * `<html data-site-theme>`) before the first paint, so that the page never flashes the default one.
 *
 * @param themes - The themes the site offers: a remembered value outside them is ignored.
 * @param storageKey - Where the picker stores the choice; the same as its `storageKey`.
 * @returns The script's text, for a `<script>` in the `<head>`.
 *
 * @example
 * <script dangerouslySetInnerHTML={{ __html: siteThemeScript(['maquis', 'paper']) }} />
 */
export function siteThemeScript(themes: readonly string[], storageKey: string = SITE_THEME_STORAGE_KEY): string {
  return `try{var t=localStorage.getItem(${literal(storageKey)});if(${literal(themes)}.indexOf(t)>-1)document.documentElement.dataset.siteTheme=t}catch(e){}`;
}
