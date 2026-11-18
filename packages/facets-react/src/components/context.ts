/**
 * What the components share: their parts' context, number formatting, and how a link click is told apart from a
 * browser gesture.
 */
import { createContext, useContext, type Context } from 'react';

/**
 * A context whose absence is a usage error: a part rendered outside its root.
 *
 * @param root - The root component's name, for the error message.
 * @returns The context, and `use(part)`, which throws for a part rendered outside its root (an invalid composition,
 *   a programming error, not an outcome).
 */
export function createPartContext<T>(root: string): {
  readonly context: Context<T | null>;
  readonly use: (part: string) => T;
} {
  const context = createContext<T | null>(null);

  return {
    context,
    use(part) {
      const value = useContext(context);

      if (value === null) throw new Error(`<${part}> must be rendered inside <${root}>.`);

      return value;
    },
  };
}

/**
 * Formats numbers for a locale: counts and page numbers are not always written with Latin digits.
 *
 * @param locale - The page's locale.
 * @returns A formatter.
 *
 * @example
 * numberFormat('ar-EG')(12); // '١٢'
 */
export const numberFormat = (locale: string): ((value: number) => string) => {
  const format = new Intl.NumberFormat(locale);

  return (value) => format.format(value);
};

/**
 * Whether a click is a plain left click the app's code did not handle: anything else (a new tab, a download) is
 * left to the browser.
 *
 * @param event - The click.
 * @returns `true` for a plain, unhandled left click.
 */
export const isPlainClick = (event: {
  readonly defaultPrevented: boolean;
  readonly button: number;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}): boolean =>
  !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
