/**
 * The Node writer of generated files.
 *
 * Key design decisions:
 *     - Rewritten only when changed: unchanged files never wake up a bundler's watcher.
 *     - Atomic writes (a temporary file, then a rename): a reader never sees half a file.
 *     - Obsolete files removed, but only those starting with `GENERATED_HEADER`: a user's own file in the folder is
 *       never touched, and no stale module lingers.
 *     - A failing run leaves the previous files as they were: the last valid generation stays usable.
 *
 * Limitation: each file is atomic, not the whole set. A disk failing in the middle of a commit (full, a permission)
 * leaves the files already renamed new and the others old, until the next run; a content error writes nothing.
 *
 * Invariants: changed-only writes, removal of obsolete generated files and their folders, user files kept
 * (`file-writer.test.ts`).
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';

import { err, GENERATED_HEADER, ok, type ListError, type Result } from '@figatellultimate/core';

import { errorCode } from './errors.js';

/** One generated file, path relative to the output folder (POSIX). */
export interface GeneratedFile {
  readonly path: string;
  readonly contents: string;
}

/** What a commit did. */
export interface CommitStats {
  readonly written: number;
  readonly removed: number;
  readonly unchanged: number;
}

/** Writes a whole generation at once. */
export interface FileWriter {
  commit(files: Iterable<GeneratedFile> | AsyncIterable<GeneratedFile>): Promise<Result<CommitStats, ListError>>;
}

function assertInsideOutput(path: string): void {
  const valid =
    !path.startsWith('/') &&
    !path.includes('\\') &&
    path.split('/').every((part) => part !== '..' && part !== '' && part !== '.');

  if (!valid)
    throw new TypeError(`Generated file paths must be relative POSIX paths inside the output, received "${path}".`);
}

async function readIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined;

    throw error;
  }
}

/** Every file under `directory`, as POSIX paths relative to it; `[]` when it does not exist yet. */
async function existingFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { recursive: true, withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => relative(directory, join(entry.parentPath, entry.name)).split(sep).join('/'));
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return [];

    throw error;
  }
}

/** Removes the now empty folders left under `directory` by removed files, deepest first. */
async function removeEmptyFolders(directory: string, removedFiles: readonly string[]): Promise<void> {
  const folders = new Set<string>();

  for (const file of removedFiles) {
    const parts = file.split('/').slice(0, -1);

    for (let depth = parts.length; depth > 0; depth--) folders.add(parts.slice(0, depth).join('/'));
  }

  for (const folder of [...folders].sort((a, b) => b.split('/').length - a.split('/').length)) {
    const absolute = join(directory, ...folder.split('/'));

    // `rmdir` only ever removes an empty folder.
    if ((await readdir(absolute)).length === 0) await rmdir(absolute);
  }
}

/**
 * The Node writer of the generated folder (`.figatellultimate/`).
 *
 * @param outputDirectory - The absolute folder to write.
 * @returns A writer whose `commit(files)` writes a file only when its contents change, atomically (a temporary file,
 *   then a rename), removes the generated files no longer produced with their empty folders, and gives what it
 *   did; a file system failure is `err({ reason })` with its code only.
 * @throws {TypeError} From `commit`, for a path that is not relative, POSIX and inside the output: a broken
 *   contract of the code generator.
 *
 * @example
 * const result = await createNodeFileWriter(join(root, '.figatellultimate')).commit(emit({ config, assembly, outputDirectory }));
 * if (result.ok) result.value; // { written: 3, removed: 0, unchanged: 59 }
 */
export function createNodeFileWriter(outputDirectory: string): FileWriter {
  return {
    async commit(files) {
      const stats = { written: 0, removed: 0, unchanged: 0 };
      const produced = new Set<string>();

      try {
        for await (const file of files) {
          assertInsideOutput(file.path);
          produced.add(file.path);
          const target = join(outputDirectory, ...file.path.split('/'));

          if ((await readIfExists(target)) === file.contents) {
            stats.unchanged += 1;
            continue;
          }

          await mkdir(dirname(target), { recursive: true });
          const temporary = `${target}.${randomUUID()}.tmp`;

          await writeFile(temporary, file.contents, 'utf8');
          await rename(temporary, target);
          stats.written += 1;
        }

        const obsolete: string[] = [];

        for (const path of await existingFiles(outputDirectory)) {
          if (produced.has(path)) continue;

          const target = join(outputDirectory, ...path.split('/'));

          if (!((await readIfExists(target)) ?? '').startsWith(GENERATED_HEADER)) continue;

          await rm(target, { force: true });
          obsolete.push(path);
        }

        await removeEmptyFolders(outputDirectory, obsolete);
        stats.removed = obsolete.length;
      } catch (error) {
        if (error instanceof TypeError) throw error;

        return err({ reason: errorCode(error) });
      }

      return ok(stats);
    },
  };
}
