/**
 * The checks of a path's parts: names (the naming rule, a length limit) and `index` positions.
 */
import { isValidName, sanitizeName } from '../../shared/names.js';
import { ok, type Result } from '../../shared/result.js';
import { fail, isIndexForbidden, type Context, type ErrorDiagnostic } from './context.js';

/**
 * Naming rule and length limit of one folder or file name.
 *
 * @param ctx - The path being parsed.
 * @param name - A folder or file name.
 * @param part - Which part it is: a segment's name, or `slug`.
 * @returns The name, or `invalid-name` (with the sanitized name as a suggestion) or `name-too-long`.
 */
export function checkName(ctx: Context, name: string, part: string): Result<string, ErrorDiagnostic> {
  if (!isValidName(name)) {
    const fixed = sanitizeName(name);

    return fail(ctx, {
      code: 'invalid-name',
      severity: 'error',
      data: { name, part },
      suggestions: fixed === '' ? [] : [fixed],
    });
  }

  const max = ctx.collection.maxNameLength;

  if (name.length > max) {
    return fail(ctx, {
      code: 'name-too-long',
      severity: 'error',
      data: { name, part, length: name.length, max },
      suggestions: [],
    });
  }

  return ok(name);
}

/**
 * Index files must not sit where the collection forbids them.
 *
 * @param ctx - The path being parsed.
 * @param under - The segment an index file sits under, `undefined` when it is not an index.
 * @returns Nothing, or `index-forbidden`.
 */
export function checkIndexPosition(ctx: Context, under: string | null | undefined): Result<null, ErrorDiagnostic> {
  if (under === undefined || !isIndexForbidden(ctx, under)) return ok(null);

  return fail(ctx, { code: 'index-forbidden', severity: 'error', data: { under }, suggestions: [] });
}
