/**
 * `@figatellu/use-intl/format`: a precompiled message formatted in the browser, with values only the browser knows
 * (a count of results, a page number). A few hundred bytes (`icu-minify`'s formatter): no ICU parser, no use-intl
 * runtime, no catalog of messages on the page.
 *
 *     server: precompiled(messages, 'ui.found') ──> { key, message } ──props──> client: formatPrecompiled(it, locale, { count })
 *
 * Key design decisions:
 *     - Every other text reaches a client component as a plain string, formatted on the server; only messages
 *       whose values the browser decides travel precompiled (`./precompile`).
 *     - The message carries its key: its ICU arguments are typed by the generated messages, so a missing or a
 *       misspelled argument does not compile.
 *
 * Invariants (`precompile.test.ts`, `precompile.test-d.ts`): the same text as use-intl's own formatting, for every
 * kind of ICU argument; the arguments typed by the key.
 *
 * Limitation: no time zone of its own: a date shows in the browser's.
 */
import format, { type CompiledMessage } from 'icu-minify/format';

import type { ArgsOf, Precompiled, RegisteredTable } from './types.js';

/** Built once per locale and options: the same message formats many times (every change of a filter). */
function memo<A extends unknown[], T>(make: (...args: A) => T): (...args: A) => T {
  const made = new Map<string, T>();

  return (...args) => {
    const key = JSON.stringify(args);
    let value = made.get(key);

    if (value === undefined) {
      value = make(...args);
      made.set(key, value);
    }

    return value;
  };
}

const formatters = {
  getNumberFormat: memo((...args: ConstructorParameters<typeof Intl.NumberFormat>) => new Intl.NumberFormat(...args)),
  getDateTimeFormat: memo(
    (...args: ConstructorParameters<typeof Intl.DateTimeFormat>) => new Intl.DateTimeFormat(...args),
  ),
  getPluralRules: memo((...args: ConstructorParameters<typeof Intl.PluralRules>) => new Intl.PluralRules(...args)),
};

/**
 * ICU's built-in styles (`{day, date, long}`, `{n, number, percent}`), as `intl-messageformat` (use-intl's formatter)
 * defines them: the compiled message names them, the formatter needs their options.
 */
const FORMATS = {
  date: {
    short: { month: 'numeric', day: 'numeric', year: '2-digit' },
    medium: { month: 'short', day: 'numeric', year: 'numeric' },
    long: { month: 'long', day: 'numeric', year: 'numeric' },
    full: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
  },
  time: {
    short: { hour: 'numeric', minute: 'numeric' },
    medium: { hour: 'numeric', minute: 'numeric', second: 'numeric' },
    long: { hour: 'numeric', minute: 'numeric', second: 'numeric', timeZoneName: 'short' },
    full: { hour: 'numeric', minute: 'numeric', second: 'numeric', timeZoneName: 'short' },
  },
  number: {
    integer: { maximumFractionDigits: 0 },
    currency: { style: 'currency' },
    percent: { style: 'percent' },
  },
} as const satisfies {
  readonly date: Readonly<Record<string, Intl.DateTimeFormatOptions>>;
  readonly time: Readonly<Record<string, Intl.DateTimeFormatOptions>>;
  readonly number: Readonly<Record<string, Intl.NumberFormatOptions>>;
};

/** The compiled node kinds of a date and a time argument (`icu-minify`'s `TYPE_DATE`, `TYPE_TIME`). */
const DATE_KINDS: readonly unknown[] = [5, 6];

/** The arguments a message formats as a date or a time: named by its own nodes, at any depth. */
function datesOf(message: unknown, names = new Set<string>()): Set<string> {
  if (!Array.isArray(message)) {
    if (typeof message === 'object' && message !== null)
      for (const item of Object.values(message)) datesOf(item, names);

    return names;
  }

  const name: unknown = message[0];
  const kind: unknown = message[1];

  if (typeof name === 'string' && DATE_KINDS.includes(kind)) names.add(name);

  for (const item of message) datesOf(item, names);

  return names;
}

/**
 * The values as the formatter takes them: a date given as a timestamp (which the generated types allow, as
 * use-intl does) becomes a `Date`.
 */
function valuesFor(
  message: CompiledMessage,
  values: Readonly<Record<string, unknown>>,
): Record<string, string | number | boolean | Date> {
  const dates = datesOf(message);

  return Object.fromEntries(
    Object.entries(values).flatMap(([name, value]): [string, string | number | boolean | Date][] => {
      if (typeof value === 'number' && dates.has(name)) return [[name, new Date(value)]];

      return typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        value instanceof Date
        ? [[name, value]]
        : [];
    }),
  );
}

/**
 * A precompiled message, formatted.
 *
 * @param message - The message, from `precompiled` on the server.
 * @param locale - The page's locale (plural rules, number and date formats).
 * @param args - Its ICU arguments, typed by its key; none for a message without any.
 * @returns The text.
 *
 * @example
 * formatPrecompiled(labels.found, locale, { count: results.length }); // "3 résultats"
 */
export function formatPrecompiled<K extends keyof RegisteredTable>(
  message: Precompiled<K>,
  locale: string,
  ...args: ArgsOf<K>
): string {
  const [values] = args;
  const text = format(message.message, locale, valuesFor(message.message, values ?? {}), {
    formatters,
    formats: FORMATS,
  });

  return Array.isArray(text) ? text.join('') : text;
}
