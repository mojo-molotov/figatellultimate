/**
 * The locales: declared once, as pure data, with their metadata.
 *
 * Key design decision: adding a locale is one declaration, then following the diagnostics (missing translations,
 * message modules).
 *
 * Invariants (`locales.test.ts`): labels and directions; invalid declarations throw.
 */
import { recordFrom } from '../shared/records.js';

/** Thrown by `defineLocales` on an invalid declaration (invalid configuration is the only case where core throws). */
export class InvalidLocalesError extends Error {
  override readonly name = 'InvalidLocalesError';
}

/**
 * How the default locale is written in the content: without a folder (`implicit`), or in its own folder like every
 * other (`explicit`).
 *
 */
export type LocaleNotation = 'implicit' | 'explicit';

/** What a locale may declare about itself; everything is optional. */
export interface LocaleInfoInput {
  /** Display name. Default: the locale's own name (e.g. "français"). */
  readonly label?: string;
  /** Writing direction. Default: inferred from the language or the script. */
  readonly dir?: 'ltr' | 'rtl';
}

/**
 * A locale's metadata: its label and writing direction.
 *
 */
export interface LocaleInfo {
  readonly label: string;
  readonly dir: 'ltr' | 'rtl';
}

/**
 * What a locale declaration may say: the list (or a record with each locale's metadata), the default, the notation.
 *
 */
export interface LocalesInput<L extends string, D extends L> {
  /** The locales, in order: a list of codes, or a record of codes to their metadata. */
  readonly list: readonly [L, ...L[]] | { readonly [K in L]: LocaleInfoInput };
  readonly default: D;
  /** Locale folder notation. Default: `'implicit'`. */
  readonly notation?: LocaleNotation;
}

/** The single declaration of the project's locales, as pure data. */
export interface Locales<L extends string = string, D extends L = L> {
  readonly list: readonly L[];
  readonly default: D;
  readonly notation: LocaleNotation;
  /** Label and writing direction of every locale. */
  readonly info: Readonly<Record<L, LocaleInfo>>;
}

const LOCALE_CODE = /^[a-z]{2,3}(-[a-z0-9]+)*$/;

/** Languages written right to left, and scripts that are (ISO 639 and ISO 15924 subtags, lowercase). */
const RTL_LANGUAGES: readonly string[] = [
  'ar',
  'arc',
  'ckb',
  'dv',
  'fa',
  'he',
  'iw',
  'ks',
  'ps',
  'sd',
  'syr',
  'ug',
  'ur',
  'yi',
];
const RTL_SCRIPTS: readonly string[] = ['adlm', 'arab', 'hebr', 'nkoo', 'rohg', 'syrc', 'thaa'];
const LTR_SCRIPTS = /^[a-z]{4}$/;

/** Writing direction from the code alone (deterministic, whatever the runtime's Intl data). */
function inferDir(code: string): 'ltr' | 'rtl' {
  const [language = '', ...subtags] = code.split('-');
  const script = subtags.find((subtag) => LTR_SCRIPTS.test(subtag));

  if (script !== undefined) return RTL_SCRIPTS.includes(script) ? 'rtl' : 'ltr';

  return RTL_LANGUAGES.includes(language) ? 'rtl' : 'ltr';
}

/** The locale's own name (e.g. "français"), or its code when the runtime has no such data. */
function ownName(code: string): string {
  try {
    return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function localeInfo(code: string, input: unknown): LocaleInfo {
  if (typeof input !== 'object' || input === null)
    throw new InvalidLocalesError(`Locale "${code}": metadata must be an object.`);

  const { label, dir }: { readonly label?: unknown; readonly dir?: unknown } = { ...input };

  if (label !== undefined && (typeof label !== 'string' || label.trim() === '')) {
    throw new InvalidLocalesError(`Locale "${code}": the label must be a non-empty string.`);
  }

  if (dir !== undefined && dir !== 'ltr' && dir !== 'rtl') {
    throw new InvalidLocalesError(`Locale "${code}": dir must be "ltr" or "rtl".`);
  }

  return Object.freeze({ label: label ?? ownName(code), dir: dir ?? inferDir(code) });
}

/** The list form of a declaration (`['fr', 'en']`), as opposed to its record form. */
const isCodeList = <L extends string>(list: LocalesInput<L, L>['list']): list is readonly [L, ...L[]] =>
  Array.isArray(list);

/** A record's codes in declaration order, typed by its keys (`for…in` keeps them, `Object.keys` would not). */
function codesOf<L extends string>(record: { readonly [K in L]: unknown }): L[] {
  const codes: L[] = [];

  for (const code in record) codes.push(code);

  return codes;
}

/**
 * Validates and freezes the locale declaration. Throws `InvalidLocalesError` on an invalid declaration.
 *
 * @param input - The locales, as a list or a record of metadata; the default; the notation (`implicit` by default).
 * @returns The frozen declaration, each locale's label (default: its own name) and direction (inferred from the
 *   language or script, deterministic).
 * @throws {InvalidLocalesError} On an invalid declaration: no locale, a duplicate, an invalid code, invalid metadata
 *   (an empty label, an unknown direction), a default that is not declared.
 *
 * @example
 * defineLocales({ list: { fr: { label: 'Français' }, en: { label: 'English' } }, default: 'fr' });
 */
export function defineLocales<const L extends string, const D extends L>(input: LocalesInput<L, D>): Locales<L, D> {
  // Both forms keep the declaration order; a record's keys are never integer-like (locale codes start with a letter).
  const declared = input.list;
  const record: { readonly [K in L]?: LocaleInfoInput } = isCodeList(declared) ? {} : declared;
  const list: readonly L[] = isCodeList(declared) ? declared : codesOf(declared);

  if (list.length === 0) throw new InvalidLocalesError('At least one locale must be declared.');

  const duplicates = list.filter((code, index) => list.indexOf(code) !== index);

  if (duplicates.length > 0) {
    throw new InvalidLocalesError(`Duplicate locales: ${[...new Set(duplicates)].join(', ')}.`);
  }

  const invalid = list.filter((code) => !LOCALE_CODE.test(code));

  if (invalid.length > 0) {
    throw new InvalidLocalesError(
      `Invalid locale codes: ${invalid.join(', ')} (expected lowercase codes such as "fr" or "pt-br").`,
    );
  }

  if (!list.includes(input.default)) {
    throw new InvalidLocalesError(`The default locale "${input.default}" is not in the list (${list.join(', ')}).`);
  }

  const info = recordFrom(list, (code) => localeInfo(code, record[code] ?? {}));

  return Object.freeze({
    list: Object.freeze([...list]),
    default: input.default,
    notation: input.notation ?? 'implicit',
    info,
  });
}
