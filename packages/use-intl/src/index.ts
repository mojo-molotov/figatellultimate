/**
 * The use-intl adapter: figatellultimate's generated messages type the keys and ICU arguments, use-intl formats.
 *
 * Architecture:
 *     .figatellultimate/messages/types (generated) ──declare module──> Register { table, namespace, messages, locale }
 *                                                                        │
 *     createTranslator / useTranslations ──typed by Register──> use-intl's translator, returned as is
 *
 * Key design decisions:
 *     - figatellultimate owns the message schema and its types; the formatting runtime is delegated to an existing
 *       library, through this thin adapter, so that the library stays replaceable.
 *     - use-intl is given untyped messages: it would otherwise derive its own key types from them, at a cost that
 *       grows with the messages. The generated lookup table types the calls instead, cheaply at any size.
 *     - A scope is a typed key path (`'content.blog'`), completed and checked; a typo does not compile.
 *
 * Invariants: the typed calls (`*.test-d.ts`), and translation end to end through the codegen's messages tests.
 */
import { createTranslator as createUseIntlTranslator, type AbstractIntlMessages, type IntlConfig } from 'use-intl/core';

import type {
  RegisteredLocale,
  RegisteredMessages,
  RegisteredNamespace,
  ScopedTranslator,
  Translator,
} from './types.js';

export type {
  ArgsOf,
  LeavesOf,
  MessagesAt,
  Precompiled,
  Register,
  RegisteredLocale,
  RegisteredMessages,
  RegisteredNamespace,
  RegisteredTable,
  ScopedKeys,
  ScopedTranslator,
  Translator,
} from './types.js';

/** What a translator needs: a locale, its messages, and use-intl's other options (formats, time zone, errors…). */
export type TranslatorOptions = Omit<IntlConfig, 'locale' | 'messages'> & {
  readonly locale: RegisteredLocale;
  /** A locale's messages, e.g. from the generated `loadMessages(locale)`. */
  readonly messages: RegisteredMessages;
};

/**
 * A translator for one locale, outside React (server code, scripts).
 *
 * @param options - The locale, its messages (e.g. the generated `loadMessages(locale)`), an optional namespace, and
 *   use-intl's other options.
 * @returns A translator whose keys and ICU arguments are typed by the generated `MessageTable`, relative to the
 *   namespace when one is given; formatting is use-intl's.
 *
 * @example
 * const t = createTranslator({ locale: 'fr', messages: await loadMessages('fr') });
 * t('home.posts', { count: 3 }); // '3 billets'
 * const scoped = createTranslator({ locale: 'fr', messages, namespace: 'content.blog' });
 * scoped('news.$.title');
 */
export function createTranslator(options: TranslatorOptions & { readonly namespace?: undefined }): Translator;
export function createTranslator<const N extends RegisteredNamespace>(
  options: TranslatorOptions & { readonly namespace: N },
): ScopedTranslator<N>;
export function createTranslator(options: TranslatorOptions & { readonly namespace?: string | undefined }): unknown {
  const { messages, namespace, ...rest } = options;
  // use-intl would derive its own key types from `messages`, at a cost that grows with them: figatellultimate's generated
  // table types the calls instead, so use-intl sees untyped messages.
  // The overloads give the public types; at runtime, use-intl's translator is returned as is (call and `has`).
  // Widened to use-intl's own type: use-intl then derives no key types from them.
  const untyped: AbstractIntlMessages = messages;

  return createUseIntlTranslator({
    ...rest,
    messages: untyped,
    ...(namespace === undefined ? {} : { namespace }),
  });
}
