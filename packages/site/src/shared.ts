/**
 * What the site's helpers share: absolute URLs on the site's origin, translations as absolute URLs, frontmatter text
 * reading, robots directives and dates. Internal to the package.
 */
import type { Site, SiteEntry } from './types.js';

/**
 * An absolute URL on the site: the origin, then the path as the build produced it.
 *
 * @param site - The site, with its origin.
 * @returns A function turning a built path into an absolute URL; an absolute URL is kept as is.
 */
export const absoluteOn =
  (site: Site) =>
  (path: string): string =>
    /^[a-z][a-z0-9+.-]*:/i.test(path)
      ? path
      : `${site.origin.replace(/\/+$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;

/**
 * No-break spaces (U+00A0, the narrow U+202F, the figure U+2007) as plain spaces: for the descriptions machines read
 * (meta, Open Graph, structured data), the French spacing being the page's typography.
 *
 * @param value - A typeset text.
 * @returns The same text with plain spaces.
 */
export const plainSpaces = (value: string): string => value.replaceAll(/[\u00a0\u202f\u2007]/g, ' ');

/**
 * A frontmatter value read as text.
 *
 * @param value - A frontmatter value.
 * @returns The value when it is a non-empty string, `undefined` otherwise.
 */
export const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/**
 * A frontmatter value read as a list of texts.
 *
 * @param value - A frontmatter value.
 * @returns A frozen copy when it is an array of strings, `undefined` otherwise.
 */
export const texts = (value: unknown): readonly string[] | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? Object.freeze([...value]) : undefined;

/**
 * Translations as absolute URLs, in the generated (declared) locale order.
 *
 * @param entry - An entry with its translations.
 * @param absolute - How a path becomes an absolute URL.
 * @returns Each existing translation, by locale.
 */
export function absoluteAlternates(entry: SiteEntry, absolute: (path: string) => string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(entry.alternates).flatMap(([locale, url]) => (url === undefined ? [] : [[locale, absolute(url)]])),
  );
}

/**
 * Whether robots directives forbid indexing (`noindex`, or `none`).
 *
 * @param robots - An entry's robots directives, if any.
 * @returns `true` with `noindex` or `none`, in any case and spacing.
 */
export const forbidsIndexing = (robots: string | undefined): boolean =>
  robots !== undefined &&
  robots.split(',').some((directive) => ['noindex', 'none'].includes(directive.trim().toLowerCase()));

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})?$/i;

/**
 * A frontmatter date as a `Date`. The app's schema owns its dates' representation; they are only read here.
 *
 * @param value - `2026-11-04`, or a date and time (`2019-08-14 21:00`, ISO with or without a time zone).
 * @returns The date, a date and time without a time zone read as UTC so that the output never depends on the
 *   machine; `undefined` when it is not a date.
 *
 * @example
 * parseDate('2019-08-14 21:00')?.toISOString(); // '2019-08-14T21:00:00.000Z'
 */
export function parseDate(value: string): Date | undefined {
  const match = DATE_ONLY.test(value) ? [value, value, '00:00', 'Z'] : DATE_TIME.exec(value);

  if (match === null) return undefined;

  const [, day, time, zone] = match;
  const date = new Date(`${day ?? ''}T${time ?? ''}${zone ?? 'Z'}`);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * A W3C (ISO 8601) date for sitemaps and schema.org: a day stays a day, anything else becomes an ISO date and time.
 *
 * @param value - A frontmatter date.
 * @returns The day as written, or an ISO date and time; `undefined` when it is not a date.
 */
export function w3cDate(value: string): string | undefined {
  if (DATE_ONLY.test(value)) return parseDate(value) === undefined ? undefined : value;

  return parseDate(value)?.toISOString();
}

/**
 * A value as a CSS string, safe inside a `<style>`: quotes and backslashes escaped, line breaks as a space, and `<`
 * as its escape, so that no value can close the element it is written in.
 *
 * @param value - Any text, e.g. a page's title.
 * @returns The quoted CSS string, which a browser reads back as the value.
 *
 * @example
 * `<style>:root{--print-title:${cssString(title)}}</style>`;
 */
export function cssString(value: string): string {
  return `"${value
    .replaceAll(/["\\]/g, (character) => `\\${character}`)
    .replaceAll(/[\n\r]+/g, ' ')
    .replaceAll('<', '\\3C ')}"`;
}
