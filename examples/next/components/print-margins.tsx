/** What a printed page shows in its margins: delegates to `PrintMargins` of `@figatellultimate/ui`. */
import { PrintMargins as UiPrintMargins } from '@figatellultimate/ui';
import type { ReactNode } from 'react';

import { site } from '../site';

/**
 * The page's title (top right of each printed page) and its absolute address (bottom left), as the theme reads them
 * (`--fig-print-title`, `--fig-print-url`).
 *
 * @param props - The page's title, and its URL path.
 * @returns A `<style>` setting both on `:root`.
 */
export function PrintMargins({ title, url }: { readonly title: string; readonly url: string }): ReactNode {
  return <UiPrintMargins title={title} url={`${site.origin}${url}`} />;
}
