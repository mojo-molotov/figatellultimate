/**
 * The message diagnostics: data only, discriminated by `code`, located by message file and key path. The CLI formats
 * them in English; nothing here prints.
 */
/** A message diagnostic: data only, located by message file and key path (never an absolute path). */
interface MessageDiagnosticOf<C extends string, S extends 'error' | 'warning', D> {
  readonly code: C;
  readonly severity: S;
  /** Message module, relative to the messages folder, e.g. `en.ts`. */
  readonly file: string;
  /** Dot path of the key, e.g. `content.blog.patch-notes.$.title`; `null` for the whole module. */
  readonly key: string | null;
  readonly data: D;
  readonly suggestions: readonly string[];
}

/** A declared locale without its message module. */
export type MissingMessageModuleDiagnostic = MessageDiagnosticOf<
  'missing-message-module',
  'error',
  { readonly locale: string }
>;
/** A message module named after a locale that is not declared. */
export type UnknownMessageModuleDiagnostic = MessageDiagnosticOf<
  'unknown-message-module',
  'error',
  { readonly name: string; readonly locales: readonly string[] }
>;
/** Produced by the loader (the CLI): the module cannot be imported (syntax, non-erasable TypeScript, a throw). */
export type UnreadableMessageModuleDiagnostic = MessageDiagnosticOf<
  'unreadable-message-module',
  'error',
  { readonly message: string }
>;
/** A module, or a key in it, holding neither a text nor a group of messages. */
export type InvalidMessageModuleDiagnostic = MessageDiagnosticOf<
  'invalid-message-module',
  'error',
  /** What was found instead of a text or a group of messages. */
  { readonly found: string }
>;
/** A key required by the content or present in the default locale, missing here. */
export type MissingMessageDiagnostic = MessageDiagnosticOf<
  'missing-message',
  'error',
  /** What the reference or the content requires there. */
  { readonly expected: 'text' | 'group' }
>;
/** A key neither required by the content nor present in the default locale. */
export type UnknownMessageDiagnostic = MessageDiagnosticOf<
  'unknown-message',
  'error',
  /** Where the key should come from: the content namespace, or the reference locale. */
  { readonly against: 'content' | 'reference' }
>;
/** A message that is not valid ICU, with the problem and its offset. */
export type InvalidMessageSyntaxDiagnostic = MessageDiagnosticOf<
  'invalid-message-syntax',
  'error',
  { readonly problem: string; readonly offset: number }
>;
/** A message whose arguments differ from the default locale's. */
export type MessageArgumentsMismatchDiagnostic = MessageDiagnosticOf<
  'message-arguments-mismatch',
  'error',
  { readonly expected: readonly string[]; readonly found: readonly string[] }
>;
/** A plural without its `other` case, which ICU requires. */
export type MissingPluralOtherDiagnostic = MessageDiagnosticOf<
  'missing-plural-other',
  'error',
  { readonly argument: string }
>;
/** A plural lacking categories the locale uses (e.g. `few` in Polish). */
export type MissingPluralCategoryDiagnostic = MessageDiagnosticOf<
  'missing-plural-category',
  'warning',
  { readonly argument: string; readonly categories: readonly string[] }
>;

/** A `navigation` label that is not a message of the reference locale. */
export type UnknownNavigationLabelDiagnostic = MessageDiagnosticOf<
  'unknown-navigation-label',
  'error',
  { readonly collection: string }
>;

/** Every message diagnostic, discriminated by `code`. */
export type MessageDiagnostic =
  | MissingMessageModuleDiagnostic
  | UnknownMessageModuleDiagnostic
  | UnreadableMessageModuleDiagnostic
  | InvalidMessageModuleDiagnostic
  | MissingMessageDiagnostic
  | UnknownMessageDiagnostic
  | InvalidMessageSyntaxDiagnostic
  | MessageArgumentsMismatchDiagnostic
  | MissingPluralOtherDiagnostic
  | MissingPluralCategoryDiagnostic
  | UnknownNavigationLabelDiagnostic;
