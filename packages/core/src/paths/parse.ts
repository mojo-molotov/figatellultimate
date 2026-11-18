/**
 * Path parsing: a source path to an entry descriptor, against its collection's grammar. Only orchestration here;
 * the steps live in `parse/`: `shape` (assigning folders to the grammar), `checks` (names, `index` position),
 * `describe` (key and route).
 *
 * Key design decisions:
 *     - One rule, one implementation: nothing else turns a path into segments, a key or a route.
 *     - Every problem of a path is reported at once (`combine`), not only the first.
 *     - In free-depth grammars, the first folder is a locale only when it is a declared one; in fixed-depth ones, a
 *       folder at the locale position that is not a declared locale is an `unknown-locale` error (`drafts/` is
 *       never taken for a locale).
 *
 * Invariants (`parse.test.ts`): the sample grammars replayed as scenarios; problems stacked; `index` yields the
 * folder URL in every collection.
 */
import type { Collection } from '../declarations/collection.js';
import type { EntryDescriptor } from './descriptor.js';
import type { WarningDiagnostic } from '../shared/diagnostics.js';
import type { Locales } from '../declarations/locales.js';
import { checkIndexPosition, checkName } from './parse/checks.js';
import { EXTENSION, type Context, type ErrorDiagnostic } from './parse/context.js';
import { describe } from './parse/describe.js';
import { shapeFixed, shapeFree } from './parse/shape.js';
import { combine, map, type Result } from '../shared/result.js';

type ParseResult = Result<EntryDescriptor, ErrorDiagnostic, WarningDiagnostic>;

function assertSourcePath(sourcePath: string): void {
  const valid =
    sourcePath.endsWith(EXTENSION) &&
    !sourcePath.startsWith('/') &&
    !sourcePath.includes('\\') &&
    sourcePath.split('/').every((part) => part !== '' && part !== '.' && part !== '..');

  if (!valid) {
    throw new TypeError(`parseEntryPath expects a relative POSIX ".mdx" path, received "${sourcePath}".`);
  }
}

/**
 * Turns a source path into an entry descriptor: the single place doing it.
 *
 * @param collectionName - The collection's name.
 * @param collection - Its declaration.
 * @param locales - The locale declaration.
 * @param sourcePath - The file's POSIX path relative to the collection's root, e.g. `en/docs/setup.mdx`.
 * @returns The descriptor (locale, segments, slug, key, route, reservation), or every problem of the path at once
 *   (locale, names, `index` position, depth). Global checks (collisions, ugly index, unused reservations) are
 *   `analyze`'s.
 * @throws {TypeError} When `sourcePath` is not a relative POSIX `.mdx` path: a broken caller contract.
 *
 * @example
 * parseEntryPath('blog', blog, locales, 'release-notes/core/en/v0-1-0.mdx');
 * // ok: { locale: 'en', segments: { category: 'release-notes', subcategory: 'core' }, slug: 'v0-1-0', key: … }
 */
export function parseEntryPath(
  collectionName: string,
  collection: Collection,
  locales: Locales,
  sourcePath: string,
): ParseResult {
  assertSourcePath(sourcePath);
  const ctx: Context = { collectionName, collection, locales, sourcePath };
  const parts = sourcePath.slice(0, -EXTENSION.length).split('/');
  const slug = parts.at(-1) ?? '';
  const folders = parts.slice(0, -1);
  const isFree = collection.grammar.some((part) => part.kind === 'rest');

  const shape = isFree ? shapeFree(ctx, folders, slug) : shapeFixed(ctx, folders, slug);
  // Independent checks, all reported together (`combine`), in the reading order of the path.
  const checked = combine([
    shape.assignment,
    shape.locale,
    ...shape.names.map(({ name, part }) => checkName(ctx, name, part)),
    checkIndexPosition(ctx, shape.indexUnder),
  ]);

  return map(checked, ([assignment]) => describe(ctx, assignment));
}
