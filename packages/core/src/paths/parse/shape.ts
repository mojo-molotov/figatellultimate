/**
 * Assigning a path's folders to its grammar: fixed-depth grammars (a wrong depth is an error) and free-depth ones
 * (one rest part). All problems found are reported at once.
 */
import type { GrammarPart, LocalePart, RestPart, SegmentPart } from '../../declarations/grammar.js';
import type { Locales } from '../../declarations/locales.js';
import { ok, type Err, type Result } from '../../shared/result.js';
import { suggest } from '../../shared/suggest.js';
import { fail, INDEX, isIndexForbidden, type Context, type ErrorDiagnostic } from './context.js';

/** Folders and file name assigned to the grammar parts. */
export interface Assignment {
  readonly locale: string;
  readonly localeSource: 'folder' | 'implicit';
  /** Values in grammar order: a segment has one folder, a rest segment any number. */
  readonly values: readonly { readonly part: SegmentPart | RestPart; readonly folders: readonly string[] }[];
  readonly slug: string;
}

/** Human-readable shape of a grammar, e.g. `<category>/<subcategory>/[<locale>/]<slug>.mdx`. */
function grammarShape(grammar: readonly GrammarPart[], extensions: readonly string[]): string {
  const extension = extensions.length === 1 ? (extensions[0] ?? '') : `{${extensions.join(',')}}`;

  return grammar
    .map((part) => {
      switch (part.kind) {
        case 'segment':
          return `<${part.name}>/`;
        case 'rest':
          return `<${part.name}...>/`;
        case 'locale':
          return part.optional ? '[<locale>/]' : '<locale>/';
        case 'slug':
          return `<slug>${extension}`;
      }
    })
    .join('');
}

/**
 * How a path maps onto the grammar. Each part is checked independently, so that every error of a path is
 * reported at once (`combine`); only a wrong depth prevents building the descriptor.
 */
export interface Shape {
  /** Folders assigned to the grammar parts; fails only when the depth does not match the grammar. */
  readonly assignment: Result<Assignment, ErrorDiagnostic>;
  /** Unknown or missing locale folder. */
  readonly locale: Result<null, ErrorDiagnostic>;
  /** Every folder name to check (with its segment, or `'folder'` when the depth is wrong), then the slug. */
  readonly names: readonly { readonly name: string; readonly part: string }[];
  /** Segment directly above an index file (`null` = collection root); `undefined` when not an index or unknown. */
  readonly indexUnder: string | null | undefined;
}

const NO_LOCALE_ERROR: Result<null, ErrorDiagnostic> = ok(null);

function isLocaleRequired(localePart: LocalePart, locales: Locales): boolean {
  return !localePart.optional || locales.notation === 'explicit';
}

function unknownLocale(ctx: Context, folder: string): Err<ErrorDiagnostic> {
  return fail(ctx, {
    code: 'unknown-locale',
    severity: 'error',
    data: { folder, locales: ctx.locales.list },
    suggestions: suggest(folder, ctx.locales.list),
  });
}

function missingLocale(ctx: Context, firstFolder: string | undefined): Err<ErrorDiagnostic> {
  return fail(ctx, {
    code: 'missing-locale',
    severity: 'error',
    data: { locales: ctx.locales.list },
    suggestions: firstFolder === undefined ? [] : suggest(firstFolder, ctx.locales.list),
  });
}

/** Shape of a path whose depth does not match the grammar: names are still checked, except declared locales. */
function wrongDepth(
  ctx: Context,
  parts: readonly (SegmentPart | RestPart)[],
  folders: readonly string[],
  slug: string,
): Shape {
  const under = parts[Math.min(folders.length, parts.length) - 1]?.name ?? null;
  const isForbiddenShallowIndex = slug === INDEX && folders.length < parts.length && isIndexForbidden(ctx, under);

  return {
    // A shallow index under a forbidden segment is reported as such: the depth error is only its consequence.
    assignment: isForbiddenShallowIndex
      ? fail(ctx, { code: 'index-forbidden', severity: 'error', data: { under }, suggestions: [] })
      : fail(ctx, {
          code: 'unexpected-depth',
          severity: 'error',
          data: { expected: grammarShape(ctx.collection.grammar, ctx.extensions), folders: folders.length },
          suggestions: [],
        }),
    locale: NO_LOCALE_ERROR,
    names: [
      ...folders.filter((folder) => !ctx.locales.list.includes(folder)).map((name) => ({ name, part: 'folder' })),
      { name: slug, part: 'slug' },
    ],
    indexUnder: undefined,
  };
}

/** Shape of a path whose folders are assigned to the grammar parts. */
function assigned(assignment: Assignment, locale: Result<null, ErrorDiagnostic>): Shape {
  const filled = assignment.values.filter(({ folders }) => folders.length > 0);

  return {
    assignment: ok(assignment),
    locale,
    names: [
      ...assignment.values.flatMap(({ part, folders }) => folders.map((name) => ({ name, part: part.name }))),
      { name: assignment.slug, part: 'slug' },
    ],
    indexUnder: assignment.slug === INDEX ? (filled.at(-1)?.part.name ?? null) : undefined,
  };
}

/**
 * Maps a path onto a fixed-depth grammar (no rest segment).
 *
 * @param ctx - The path being parsed.
 * @param folders - The path's folders.
 * @param slug - The file name without `.mdx`.
 * @returns The assignment of folders to the grammar's parts, or the problems (wrong depth, unknown locale).
 */
export function shapeFixed(ctx: Context, folders: readonly string[], slug: string): Shape {
  const beforeSlug = ctx.collection.grammar.filter((part) => part.kind !== 'slug');
  const segments = beforeSlug.filter((part): part is SegmentPart => part.kind === 'segment');
  const localeIndex = beforeSlug.findIndex((part) => part.kind === 'locale');
  const localePart = beforeSlug[localeIndex];
  const assign = (
    segmentFolders: readonly string[],
    locale: string,
    localeSource: 'folder' | 'implicit',
  ): Assignment => ({
    locale,
    localeSource,
    slug,
    values: segments.map((part, i) => ({ part, folders: [segmentFolders[i] ?? ''] })),
  });

  if (localePart?.kind === 'locale' && folders.length === segments.length + 1) {
    const folder = folders[localeIndex] ?? '';
    const segmentFolders = folders.filter((_, i) => i !== localeIndex);

    return ctx.locales.list.includes(folder)
      ? assigned(assign(segmentFolders, folder, 'folder'), NO_LOCALE_ERROR)
      : assigned(assign(segmentFolders, ctx.locales.default, 'folder'), unknownLocale(ctx, folder));
  }

  if (folders.length === segments.length) {
    const locale =
      localePart?.kind === 'locale' && isLocaleRequired(localePart, ctx.locales)
        ? missingLocale(ctx, folders[localeIndex])
        : NO_LOCALE_ERROR;

    return assigned(assign(folders, ctx.locales.default, 'implicit'), locale);
  }

  return wrongDepth(ctx, segments, folders, slug);
}

/**
 * Maps a path onto a free-depth grammar (one rest segment; locale, if any, comes first).
 *
 * @param ctx - The path being parsed.
 * @param allFolders - The path's folders.
 * @param slug - The file name without `.mdx`.
 * @returns The assignment: the first folder a locale only when it is a declared one.
 */
export function shapeFree(ctx: Context, allFolders: readonly string[], slug: string): Shape {
  const beforeSlug = ctx.collection.grammar.filter((part) => part.kind !== 'slug');
  const localePart = beforeSlug[0]?.kind === 'locale' ? beforeSlug[0] : undefined;
  const named = beforeSlug.filter((part): part is SegmentPart | RestPart => part.kind !== 'locale');
  const restIndex = named.findIndex((part) => part.kind === 'rest');

  let folders = allFolders;
  let locale: string = ctx.locales.default;
  let localeSource: 'folder' | 'implicit' = 'implicit';
  let localeCheck = NO_LOCALE_ERROR;

  if (localePart !== undefined) {
    const first = folders[0];

    if (first !== undefined && ctx.locales.list.includes(first)) {
      locale = first;
      localeSource = 'folder';
      folders = folders.slice(1);
    } else if (isLocaleRequired(localePart, ctx.locales)) {
      localeCheck = missingLocale(ctx, first);
    }
  }

  if (folders.length < named.length - 1) {
    return { ...wrongDepth(ctx, named, folders, slug), locale: localeCheck };
  }

  const after = named.length - 1 - restIndex;
  const restFolders = folders.slice(restIndex, folders.length - after);
  const values = named.map((part, i) => {
    if (i < restIndex) return { part, folders: [folders[i] ?? ''] };

    if (i === restIndex) return { part, folders: restFolders };

    return { part, folders: [folders[folders.length - (named.length - i)] ?? ''] };
  });

  return assigned({ locale, localeSource, slug, values }, localeCheck);
}
