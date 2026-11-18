/**
 * One ICU message: its syntax, its arguments and their types, and its plurals against a locale's categories
 * (`Intl.PluralRules`). The parser is a build-time dependency only: it never reaches a runtime package.
 */
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';

import type { ArgumentType } from './model.js';

/** One ICU message, analyzed for a locale. */
export type IcuAnalysis =
  | { readonly ok: false; readonly problem: string; readonly offset: number }
  | {
      readonly ok: true;
      /** Arguments in order of first appearance. */
      readonly args: Readonly<Record<string, ArgumentType>>;
      /** Plural arguments without an `other` clause. */
      readonly missingOther: readonly string[];
      /** Plural categories the locale uses that a plural lacks (exact `=n` selectors aside, `other` aside). */
      readonly missingCategories: readonly { readonly argument: string; readonly categories: readonly string[] }[];
    };

const TEXT: ArgumentType = { kind: 'text' };
const NUMBER: ArgumentType = { kind: 'number' };
const DATE: ArgumentType = { kind: 'date' };

/** The parser reports errors as `SyntaxError`s carrying the error kind as message and a location. */
function syntaxProblem(error: unknown): { problem: string; offset: number } {
  const problem = error instanceof Error ? error.message : String(error);
  const location: unknown = typeof error === 'object' && error !== null ? Reflect.get(error, 'location') : undefined;
  const start: unknown = typeof location === 'object' && location !== null ? Reflect.get(location, 'start') : undefined;
  const offset: unknown = typeof start === 'object' && start !== null ? Reflect.get(start, 'offset') : undefined;

  return { problem, offset: typeof offset === 'number' ? offset : 0 };
}

/** Plural categories of a locale, per plural type, as `Intl.PluralRules` gives them (other aside). */
function categoriesOf(locale: string, type: Intl.PluralRulesOptions['type']): readonly string[] {
  return new Intl.PluralRules(locale, { type }).resolvedOptions().pluralCategories.filter((c) => c !== 'other');
}

/**
 * Parses and analyzes one ICU message for a locale.
 *
 * @param message - The message text.
 * @param locale - Its locale, for the plural categories it uses.
 * @returns Its arguments and their types (a number or a date seen anywhere wins over a plain argument), the plurals
 *   lacking `other`, and the plural categories the locale uses that a plural lacks; or the syntax problem and its
 *   offset. Rich-text tags are read as plain text.
 *
 * @example
 * analyzeIcu('{count, plural, one {# post} other {# posts}}', 'en');
 * // { ok: true, args: { count: { kind: 'number' } }, missingOther: [], missingCategories: [] }
 */
export function analyzeIcu(message: string, locale: string): IcuAnalysis {
  let elements: MessageFormatElement[];

  try {
    elements = parse(message, { requiresOtherClause: false, ignoreTag: true });
  } catch (error) {
    return { ok: false, ...syntaxProblem(error) };
  }

  const args = new Map<string, ArgumentType>();
  const missingOther: string[] = [];
  const missingCategories: { argument: string; categories: readonly string[] }[] = [];
  // A plain argument is the weakest type: a number or a date seen elsewhere in the message wins.
  const add = (name: string, type: ArgumentType): void => {
    const known = args.get(name);

    if (known === undefined || (known.kind === 'text' && type.kind !== 'text')) args.set(name, type);
  };
  const walk = (list: readonly MessageFormatElement[]): void => {
    for (const element of list) {
      switch (element.type) {
        case TYPE.argument:
          add(element.value, TEXT);
          break;
        case TYPE.number:
          add(element.value, NUMBER);
          break;
        case TYPE.date:
        case TYPE.time:
          add(element.value, DATE);
          break;
        case TYPE.select: {
          const options = Object.keys(element.options);

          add(element.value, {
            kind: 'select',
            options: options.filter((option) => option !== 'other'),
            open: options.includes('other'),
          });

          for (const option of Object.values(element.options)) walk(option.value);

          break;
        }
        case TYPE.plural: {
          add(element.value, NUMBER);
          const selectors = Object.keys(element.options);

          if (!selectors.includes('other')) missingOther.push(element.value);

          const lacking = categoriesOf(locale, element.pluralType).filter((c) => !selectors.includes(c));

          if (lacking.length > 0) missingCategories.push({ argument: element.value, categories: lacking });

          for (const option of Object.values(element.options)) walk(option.value);

          break;
        }
        case TYPE.tag:
          walk(element.children);
          break;
        case TYPE.literal:
        case TYPE.pound:
          break;
      }
    }
  };

  walk(elements);

  return { ok: true, args: Object.fromEntries(args), missingOther, missingCategories };
}

/**
 * `name: kind` lines, sorted: what two locales must share for the same message.
 *
 * @param args - A message's arguments and their kinds.
 * @returns One `name: kind` line per argument, sorted.
 */
export const signature = (args: Readonly<Record<string, ArgumentType>>): string[] =>
  Object.entries(args)
    .map(([name, type]) => `${name}: ${type.kind}`)
    .sort();
