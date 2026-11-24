/**
 * The messages precompiled, once per locale (server), with `@figatellultimate/use-intl/precompile`: next-intl's translator
 * reads them (its `format-only` runtime, `withPrecompiledMessages` in `next.config.ts`), and client components get
 * the few whose values only the browser knows, precompiled, to format with `formatPrecompiled`. Every other text
 * reaches them as a plain string: no client component imports next-intl, no page carries the catalog of messages.
 */
import {
  precompiled,
  precompiledLoader,
  type Precompiled,
  type PrecompiledMessages,
} from '@figatellultimate/use-intl/precompile';

import type { Locale } from '#figatellultimate/locales';
import { loadMessages, type MessageKey } from '#figatellultimate/messages';

/**
 * A locale's messages, precompiled, once per process.
 *
 * @param locale - The locale.
 * @returns Its messages, every ICU message compiled.
 */
export const precompiledMessages: (locale: Locale) => Promise<PrecompiledMessages> = precompiledLoader(loadMessages);

/**
 * A message precompiled, for a client component to format with values only the browser knows.
 *
 * @param locale - The page's locale.
 * @param key - The message's key.
 * @returns The message with its key, which types its arguments.
 */
export async function compiled<K extends MessageKey>(locale: Locale, key: K): Promise<Precompiled<K>> {
  return precompiled(await precompiledMessages(locale), key);
}
