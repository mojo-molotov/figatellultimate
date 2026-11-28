/**
 * Print margin tokens (`--fig-print-title`, `--fig-print-url`): sets a page's title and absolute URL as CSS custom
 * properties on `:root`, consumed by `@figatellultimate/themes/base.css` `@page` margin boxes when printing.
 *
 * Key design decision: server-safe (no `'use client'`) and self-escaping (`"`, `\`, line breaks, and `<` escaped as
 * `\3C ` so no title or URL can break out of `<style>`).
 *
 * Invariant (`print-margins.test.tsx`): renders a `<style>` setting both custom properties with escaped CSS strings.
 */
import type { ReactNode } from 'react';

/** Escapes a text value as a CSS string safe inside `<style>`. */
function cssString(value: string): string {
  return `"${value
    .replaceAll(/["\\]/g, (character) => `\\${character}`)
    .replaceAll(/[\n\r]+/g, ' ')
    .replaceAll('<', '\\3C ')}"`;
}

/** Props of `PrintMargins`. */
export interface PrintMarginsProps {
  /** Page title shown in the top-right printed margin box. */
  readonly title: string;
  /** Absolute page URL shown in the bottom-left printed margin box. */
  readonly url: string;
}

/**
 * Sets `--fig-print-title` and `--fig-print-url` on `:root` for `@page` print margin boxes.
 *
 * @param props - The page's title and absolute URL.
 * @returns A `<style>` element defining both CSS custom properties.
 *
 * @example
 * <PrintMargins title="Installation" url="https://example.com/docs/installation" />
 */
export function PrintMargins({ title, url }: PrintMarginsProps): ReactNode {
  return <style>{`:root{--fig-print-title:${cssString(title)};--fig-print-url:${cssString(url)}}`}</style>;
}
