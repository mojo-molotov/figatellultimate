/**
 * `@figatellultimate/ui/scripts`: the inline scripts a page puts in its `<head>`, run before the first paint, so that a
 * remembered choice (the theme, a closed table of contents) never flashes on load.
 *
 * Key design decision: an entry of its own, without `'use client'`: a server component (a root layout) calls these,
 * which it cannot do through the client components' entry.
 */

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
  return `try{if(localStorage.getItem(${JSON.stringify(storageKey)})==='closed')document.documentElement.dataset.toc='closed'}catch(e){}`;
}
