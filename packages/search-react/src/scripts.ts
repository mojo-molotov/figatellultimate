// prettier-ignore
/**
 * `@figatellultimate/search-react/scripts`: the inline script a page puts right after its search dialog's trigger, run
 * before the first paint, so that the trigger's shortcut shows the reader's keys (⌘ on an Apple device, Ctrl
 * elsewhere) from the start, never switching once the page is hydrated.
 *
 *     the server's trigger ──> searchShortcutScript (before the first paint) ──> <kbd data-platform="mac" | "other">
 *                              SearchDialog, once hydrated (a layout effect)  ──>            the same
 *
 * Key design decisions:
 *     - An entry of its own, without `'use client'`: a server component (a layout) puts it in the page, which it
 *       cannot do through the client components' entry.
 *     - The platform read from the user agent, the same pattern for the script and the component (`APPLE_PLATFORM`):
 *       `navigator.platform` is deprecated, and `userAgentData` exists in Chromium only. An iPad says « Macintosh »:
 *       its keyboard has ⌘ too.
 *     - Marked on the shortcut itself, never on `<html>`: a page with no shortcut changes nothing.
 *
 * Invariants (`search-dialog.test.tsx`): the script marks the shortcut as the component does, on an Apple platform
 * and on any other.
 */

/** The user agents of Apple devices, whose keyboards have ⌘: the script's pattern and the component's. */
export const APPLE_PLATFORM: string = 'Mac|iPhone|iPad|iPod';

/**
 * The inline script that marks every search shortcut with the reader's platform before the first paint (`mac` or
 * `other`), for the stylesheet to show its keys.
 *
 * @example
 * <SearchDialog … />
 * <script dangerouslySetInnerHTML={{ __html: searchShortcutScript }} />
 */
export const searchShortcutScript: string = `try{var p=/${APPLE_PLATFORM}/.test(navigator.userAgent)?'mac':'other';document.querySelectorAll('[data-slot="search-dialog-shortcut"]').forEach(function(k){k.setAttribute('data-platform',p)})}catch(e){}`;
