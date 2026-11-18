/**
 * The messages precompiled, once per locale (server), with `@figatellu/use-intl/precompile`: next-intl's translator
 * reads them (its `format-only` runtime, `withPrecompiledMessages` in `next.config.ts`), and client components get
 * the few whose values only the browser knows, precompiled, to format with `formatPrecompiled`. Every other text
 * reaches them as a plain string: no client component imports next-intl, no page carries the catalog of messages.
 */
import {
  precompiled,
  precompileMessages,
  type Precompiled,
  type PrecompiledMessages,
} from '@figatellu/use-intl/precompile';

import type { Locale } from '#figatellu/locales';
import { loadMessages, type MessageKey } from '#figatellu/messages';

/** Each locale's precompiled messages, compiled once per process. */
const cache = new Map<Locale, PrecompiledMessages>();

/**
 * A locale's messages, precompiled.
 *
 * @param locale - The locale.
 * @returns Its messages, every ICU message compiled.
 */
export async function precompiledMessages(locale: Locale): Promise<PrecompiledMessages> {
  let tree = cache.get(locale);

  if (tree === undefined) {
    tree = precompileMessages(await loadMessages(locale));
    cache.set(locale, tree);
  }

  return tree;
}

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
