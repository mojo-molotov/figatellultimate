/**
 * The adapter's types, read from the generated `Register` augmentation: lookups by indexed access only, never a
 * distributive conditional over every key, so that tens of thousands of keys stay cheap to typecheck.
 */
import type { CompiledMessage } from 'icu-minify/format';
import type { AbstractIntlMessages } from 'use-intl/core';

/**
 * Filled by the generated code (`.figatellultimate/messages/types.ts`, when the config declares `runtime: 'use-intl'`):
 * `declare module '@figatellultimate/use-intl' { interface Register { … } }`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmented by the generated code
export interface Register {}

type Loose = Readonly<Record<string, unknown>>;

/** Every message key to its ICU arguments, or `undefined` (generated `MessageTable`). */
export type RegisteredTable = Register extends { readonly table: infer T }
  ? T
  : Readonly<Record<string, Loose | undefined>>;
/** Every group path, the valid scopes. */
export type RegisteredNamespace = Register extends { readonly namespace: infer N extends string } ? N : string;
/**
 * The shape of a locale's messages (generated `Messages`): nested texts, as use-intl takes them. The generated type is
 * an object type alias, never an interface, so that it fits use-intl's index signature.
 */
export type RegisteredMessages = Register extends { readonly messages: infer M extends AbstractIntlMessages }
  ? M
  : AbstractIntlMessages;
/** The declared locales (generated `Locale`). */
export type RegisteredLocale = Register extends { readonly locale: infer L extends string } ? L : string;

type Table = RegisteredTable;

/** The subtree of the messages at a dot path (a scope), by indexed access, segment by segment. */
export type MessagesAt<T, P extends string> = P extends `${infer Head}.${infer Rest}`
  ? Head extends keyof T
    ? MessagesAt<T[Head], Rest>
    : never
  : P extends keyof T
    ? T[P]
    : never;

/** The dot paths of every text of a subtree: only the scoped branch is walked, never the whole table. */
export type LeavesOf<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : LeavesOf<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** The keys of a scope, relative to it. */
export type ScopedKeys<N extends string> = LeavesOf<MessagesAt<RegisteredMessages, N>>;

/**
 * The arguments of a message: none, or its ICU values, read from the table by indexed access; optional when
 * they may be absent (without generated messages, every key may or may not take values). Never a distributive
 * conditional over the keys: the check types are `Table[F]` and `undefined`, so large tables stay cheap.
 */
export type ArgsOf<F extends keyof Table> = Table[F] extends undefined
  ? []
  : undefined extends Table[F]
    ? [values?: Table[F]]
    : [values: Table[F]];

type ScopedArgs<N extends string, K extends string> = `${N}.${K}` extends infer F extends keyof Table
  ? ArgsOf<F>
  : never;

/** A translator over every key, typed by figatellultimate's generated messages; formatting is use-intl's. */
export interface Translator {
  <K extends keyof Table>(key: K, ...args: ArgsOf<K>): string;
  /** Whether the messages hold this key (e.g. optional content). */
  has(key: keyof Table): boolean;
}

/**
 * A translator scoped to a namespace: keys relative to it. `Sub` is the scope's subtree, resolved when the
 * translator is created, so no type is ever computed over a generic scope.
 */
export interface ScopedTranslator<N extends string, Sub = MessagesAt<RegisteredMessages, N>> {
  <K extends LeavesOf<Sub>>(key: K, ...args: ScopedArgs<N, K>): string;
  has(key: LeavesOf<Sub>): boolean;
}

/**
 * A message precompiled on the server (`precompiled` of `./precompile`), for a client component to format with
 * `formatPrecompiled` (`./format`): it carries its key, so its ICU arguments are typed by it. Plain data.
 */
export interface Precompiled<K extends keyof RegisteredTable = keyof RegisteredTable> {
  readonly key: K;
  readonly message: CompiledMessage;
}
