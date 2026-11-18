/**
 * The use-intl adapter's React entry: `useTranslations`, typed by the generated messages.
 */
import { useTranslations as useUseIntlTranslations } from 'use-intl/react';

import type { RegisteredNamespace, ScopedTranslator, Translator } from './types.js';

/**
 * The React hook: use-intl's `useTranslations`, inside its `IntlProvider`, typed by figatellu's generated messages.
 *
 * @param namespace - A scope: keys become relative to it.
 * @returns A translator typed by the generated `MessageTable`.
 *
 * @example
 * const t = useTranslations('ui');
 * t('search.trigger');
 */
export function useTranslations(): Translator;
export function useTranslations<const N extends RegisteredNamespace>(namespace: N): ScopedTranslator<N>;
export function useTranslations(namespace?: string): unknown {
  // Same bypass as `createTranslator`: use-intl's key typing is replaced by the generated table; the
  // overloads give the public types, and use-intl's translator is returned as is.
  return useUseIntlTranslations(namespace);
}
