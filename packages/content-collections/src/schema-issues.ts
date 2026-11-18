/**
 * Frontmatter schema issues, re-validated into structured diagnostics: Content Collections flattens them into text.
 *
 * Invariant: the same scenario gives the same diagnostics with valibot and zod (`content-source.test.ts`).
 */
import type { FileErrorDiagnostic } from '@figatellu/core';

interface StandardIssue {
  readonly message: string;
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[] | undefined;
}
/** The part of a Standard Schema the re-validation needs. */
export interface StandardSchemaLike {
  readonly '~standard': {
    validate(
      value: unknown,
    ): { readonly issues?: readonly StandardIssue[] } | Promise<{ readonly issues?: readonly StandardIssue[] }>;
  };
}

/**
 * Whether a collection carries a Standard Schema.
 *
 * @param value - A Content Collections collection.
 * @returns `true` when its `schema` validates as a Standard Schema.
 */
export function hasStandardSchema(value: unknown): value is { readonly schema: StandardSchemaLike } {
  if (typeof value !== 'object' || value === null || !('schema' in value)) return false;

  const schema: unknown = value.schema;

  return typeof schema === 'object' && schema !== null && '~standard' in schema;
}

function fieldOf(issue: StandardIssue): string {
  return (issue.path ?? []).map((segment) => String(typeof segment === 'object' ? segment.key : segment)).join('.');
}

/**
 * One diagnostic per schema issue of a document's frontmatter.
 *
 * @param collection - The document's collection.
 * @param sourcePath - Its collection-relative path.
 * @param schema - The collection's schema.
 * @param raw - The raw frontmatter.
 * @returns `missing-frontmatter-field` for a field absent from the raw frontmatter (established by figatellu,
 *   whatever the schema library), `invalid-frontmatter-field` with the library's message for a field present but
 *   invalid, `invalid-frontmatter` for an issue without a path.
 *
 * @example
 * await frontmatterDiagnostics('blog', 'news/launch.mdx', schema, { title: 3 });
 */
export async function frontmatterDiagnostics(
  collection: string,
  sourcePath: string,
  schema: StandardSchemaLike,
  raw: Readonly<Record<string, unknown>>,
): Promise<FileErrorDiagnostic[]> {
  const { issues = [] } = await schema['~standard'].validate(raw);

  return issues.map((issue): FileErrorDiagnostic => {
    const field = fieldOf(issue);
    const base = { severity: 'error', collection, sourcePath, suggestions: [] } as const;

    if (field === '') return { ...base, code: 'invalid-frontmatter', data: { message: issue.message } };

    const topLevel = field.split('.')[0] ?? field;

    return topLevel in raw
      ? { ...base, code: 'invalid-frontmatter-field', data: { field, message: issue.message } }
      : { ...base, code: 'missing-frontmatter-field', data: { field } };
  });
}
