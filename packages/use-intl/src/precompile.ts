// prettier-ignore
/**
 * `@figatellultimate/use-intl/precompile` (server): messages precompiled, every ICU message parsed once at build time.
 *
 *     messages (validated) ──> precompileMessages ──┬─> next-intl's `format-only` runtime (`withPrecompiledMessages`)
 *                                                   └─> precompiled(tree, key) ──> a client component's props
 *
 * Key design decisions:
 *     - The compiler is next-intl's (`icu-minify`, a peer dependency: the app's and next-intl's must be one version,
 *       since next-intl's runtime reads what it compiled).
 *     - Plain data: the compiler builds its plural and select options without a prototype, which React does not pass
 *       from a server component to a client one; they get the plain object prototype, in place (each compiled
 *       message is a fresh value).
 *     - A message for the client carries its key (`Precompiled<K>`): `formatPrecompiled` types its arguments by it.
 *
 * Invariants (`precompile.test.ts`, `precompile.test-d.ts`): every message compiled, as plain data; a key naming a
 * group throws; the key's type carried to the client; each locale loaded and compiled once, again after a failure
 * (`precompiledLoader`).
 */
import compile from 'icu-minify/compile';
import type { CompiledMessage } from 'icu-minify/format';
import type { AbstractIntlMessages } from 'use-intl/core';

import type { Precompiled, RegisteredTable } from './types.js';

export type { Precompiled } from './types.js';

/** A locale's messages, precompiled: each leaf a compiled message, as plain data. */
export type PrecompiledMessages = { readonly [key: string]: PrecompiledMessages | CompiledMessage };

/** Gives every object of a compiled message the plain object prototype, in place: plain data, as React passes it. */
function plain(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;

  if (!Array.isArray(value) && Object.getPrototypeOf(value) === null) Object.setPrototypeOf(value, Object.prototype);

  for (const item of Object.values(value)) plain(item);
}

/** A message compiled, as plain data. */
function compiledOf(text: string): CompiledMessage {
  const message = compile(text);

  plain(message);

  return message;
}

/**
 * A locale's messages, every ICU message compiled.
 *
 * @param messages - Its messages, as figatellultimate validated them (`loadMessages(locale)`).
 * @returns The same tree, each message compiled, plain data.
 *
 * @example
 * const tree = precompileMessages(await loadMessages('fr'));
 */
export function precompileMessages(messages: AbstractIntlMessages): PrecompiledMessages {
  return Object.fromEntries(
    Object.entries(messages).map(([key, value]) => [
      key,
      typeof value === 'string' ? compiledOf(value) : precompileMessages(value),
    ]),
  );
}

/**
 * One precompiled message, for a client component to format with values only the browser knows.
 *
 * @param messages - The locale's precompiled messages.
 * @param key - The message's key, typed by the generated messages.
 * @returns The message with its key, plain data a server component passes to a client one.
 * @throws {Error} When the key names a group of messages, or nothing (the messages are not the generated ones).
 *
 * @example
 * <SearchBox found={precompiled(tree, 'ui.search.found')} />
 */
export function precompiled<K extends Extract<keyof RegisteredTable, string>>(
  messages: PrecompiledMessages,
  key: K,
): Precompiled<K> {
  let node: PrecompiledMessages | CompiledMessage | undefined = messages;

  for (const part of key.split('.')) node = typeof node === 'object' && !Array.isArray(node) ? node[part] : undefined;

  if (typeof node !== 'string' && !Array.isArray(node)) throw new Error(`"${key}" is not a message.`);

  return { key, message: node };
}

/**
 * A loader of each locale's messages, precompiled once per process: the server's translator and the client's
 * messages read the same tree.
 *
 * @param load - Loads a locale's messages, e.g. the generated `loadMessages`.
 * @returns A function giving a locale's precompiled messages, loaded and compiled on its first call (one load for
 *   calls at once); a failed load is loaded again on the next call.
 *
 * @example
 * export const precompiledMessages = precompiledLoader(loadMessages);
 */
export function precompiledLoader<L extends string>(
  load: (locale: L) => Promise<AbstractIntlMessages>,
): (locale: L) => Promise<PrecompiledMessages> {
  const known = new Map<L, Promise<PrecompiledMessages>>();

  return (locale) => {
    const cached = known.get(locale);

    if (cached !== undefined) return cached;

    const tree = load(locale).then(precompileMessages);

    known.set(locale, tree);
    tree.catch(() => {
      known.delete(locale);
    });

    return tree;
  };
}
