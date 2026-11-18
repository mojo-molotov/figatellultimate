/** What a printed page shows in its margins: its title and its address, for the maquis theme's margin boxes. */
import type { ReactNode } from 'react';

import { site } from '../site';

/** A CSS string: quotes, backslashes and line breaks escaped, and `<` too, so that it never closes the `<style>`. */
const cssString = (value: string): string =>
  `"${value
    .replaceAll(/["\\]/g, (character) => `\\${character}`)
    .replaceAll(/[\n\r]+/g, ' ')
    .replaceAll('<', '\\3C ')}"`;

/**
 * The page's title (top right of each printed page) and its absolute address (bottom left), as the maquis theme
 * reads them (`--fig-print-title`, `--fig-print-url`): CSS custom properties on the root, which the printed pages'
 * margins inherit.
 *
 * @param props - The page's title, and its URL path.
 * @returns A `<style>` setting both on `:root`.
 */
export function PrintMargins({ title, url }: { readonly title: string; readonly url: string }): ReactNode {
  return (
    <style>{`:root{--fig-print-title:${cssString(title)};--fig-print-url:${cssString(`${site.origin}${url}`)}}`}</style>
  );
}
