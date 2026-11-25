/**
 * What every parsing step shares: the path being parsed, and how a step fails with a located diagnostic.
 */
import type { Collection } from '../../declarations/collection.js';
import { diagnostic, type FileErrorDiagnostic } from '../../shared/diagnostics.js';
import type { Locales } from '../../declarations/locales.js';
import { err, type Err } from '../../shared/result.js';

/** What every parsing step knows about the path being parsed. */
export interface Context {
  readonly collectionName: string;
  readonly collection: Collection;
  readonly locales: Locales;
  readonly sourcePath: string;
  /** The extensions of a content file (`extensions` of the config); any other file is ignored. */
  readonly extensions: readonly string[];
}

/** The file name of a folder's own entry (`index.mdx`). */
export const INDEX = 'index';
/** The extensions of a content file by default: MDX only. */
export const DEFAULT_EXTENSIONS: readonly string[] = Object.freeze(['.mdx']);

/**
 * The extension a path ends with, among those given.
 *
 * @param sourcePath - A path.
 * @param extensions - The extensions of a content file.
 * @returns The longest one it ends with, `undefined` when none.
 */
export const extensionOf = (sourcePath: string, extensions: readonly string[]): string | undefined =>
  [...extensions].sort((a, b) => b.length - a.length).find((extension) => sourcePath.endsWith(extension));

/** The errors parsing a path can give: about one file only. */
export type ErrorDiagnostic = FileErrorDiagnostic;

/** A diagnostic without its location, distributed over the union so that each code keeps its own `data`. */
type Unlocated<D> = D extends unknown ? Omit<D, 'collection' | 'sourcePath'> : never;

/**
 * Failure track with one located diagnostic; assignable to any `Result<_, ErrorDiagnostic, _>`.
 *
 * @param ctx - The path being parsed.
 * @param error - The diagnostic, without its location.
 * @returns The failure, located.
 */
export function fail(ctx: Context, error: Unlocated<ErrorDiagnostic>): Err<ErrorDiagnostic> {
  return err(diagnostic({ ...error, collection: ctx.collectionName, sourcePath: ctx.sourcePath }));
}

/**
 * Whether an index file is forbidden directly under this segment (`null` = collection root).
 *
 * @param ctx - The path being parsed.
 * @param under - The segment it sits directly under, `null` for the root.
 * @returns Whether the collection forbids an index file there.
 */
export function isIndexForbidden(ctx: Context, under: string | null): boolean {
  return under === null ? ctx.collection.indexForbiddenAtRoot : ctx.collection.indexForbiddenUnder.includes(under);
}
