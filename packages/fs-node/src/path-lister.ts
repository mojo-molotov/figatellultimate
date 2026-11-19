/**
 * The Node `PathLister`: what files a content folder holds, as POSIX paths.
 *
 * Key design decisions:
 *     - Paths are POSIX inside figatellultimate; native separators are converted here, at the edge, never further in.
 *     - One recursive read per directory, files only: the content's structure is read once.
 *     - Failures are values with the file system code only: never the machine's absolute path (it would leak into
 *       diagnostics).
 *
 * Invariants: the same scenarios as the in-memory reference, replayed on both (`path-lister.test.ts`); no absolute
 * path in any result, raw or URL-encoded; the Windows CI matrix.
 */
import { readdir } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';

import { err, ok, type PathLister } from '@figatellultimate/core';

import { errorCode } from './errors.js';

/** Project-relative POSIX directory, inside the project: anything else is a broken caller contract. */
function assertProjectDirectory(directory: string): void {
  const valid =
    !isAbsolute(directory) &&
    !directory.startsWith('/') &&
    !directory.includes('\\') &&
    directory.split('/').every((part) => part !== '..');

  if (!valid) {
    throw new TypeError(`PathLister expects a project-relative POSIX directory, received "${directory}".`);
  }
}

/**
 * The Node implementation of core's `PathLister` port.
 *
 * @param projectRoot - The project's absolute root; never reported.
 * @returns A lister whose `list(directory)` reads a project-relative POSIX directory recursively, once, and gives its
 *   files (symbolic links not followed) as sorted POSIX paths relative to it; a read failure is `err({ reason })`
 *   with the file system code only.
 * @throws {TypeError} From `list`, for a directory that is absolute, outside the project or not POSIX: a broken
 *   caller contract, not an outcome.
 *
 * @example
 * const result = await createNodePathLister(projectRoot).list('content/blog');
 * if (result.ok) result.value; // ['news/en/launch.mdx', 'news/launch.mdx']
 */
export function createNodePathLister(projectRoot: string): PathLister {
  return {
    async list(directory, options) {
      assertProjectDirectory(directory);
      options?.signal?.throwIfAborted();
      const base = join(projectRoot, ...directory.split('/'));
      let entries;

      try {
        entries = await readdir(base, { recursive: true, withFileTypes: true });
      } catch (error) {
        return err({ reason: errorCode(error) });
      }

      const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => relative(base, join(entry.parentPath, entry.name)).split(sep).join('/'))
        .sort();

      return ok(files);
    },
  };
}
