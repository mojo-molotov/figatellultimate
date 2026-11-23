/**
 * The content's local images checked on disk: every image the content references (`localImageReferences` of
 * `@figatellultimate/core`) must exist in the app's public folder (`publicDirectory`, `public` by default), else a
 * `missing-image` error, the closest files of its folder suggested. Run by `build`, `check` and `watch`, so that a
 * broken image stops the build instead of shipping.
 *
 * Key design decisions:
 *     - In the CLI, which reads the disk; the core lists the references, purely.
 *     - An error, as any content error: nothing is written, the page would show a broken image.
 *     - A path that would leave the public folder (`/../secret.png`) is never read: missing, as it would be online.
 *
 * Invariant (`e2e.test.ts`): a missing cover, folder image or body image is an error naming its file and field, the
 * closest file suggested; an existing one passes.
 */
import { access, readdir } from 'node:fs/promises';
import { isAbsolute, join, posix, relative } from 'node:path';

import {
  localImageReferences,
  suggest,
  type Entry,
  type FigatellultimateConfig,
  type MissingImageDiagnostic,
} from '@figatellultimate/core';

/** Whether a file exists. */
const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

/** The files of a folder, by name; none when it cannot be listed. */
const filesOf = (folder: string): Promise<string[]> => readdir(folder).catch(() => []);

/**
 * The `missing-image` errors of a run: each local image the content references and the public folder lacks.
 *
 * @param config - The config: its collections and its public folder.
 * @param directory - The project's root, where `publicDirectory` is.
 * @param entries - The run's entries: their frontmatter and bodies.
 * @returns One error per missing image and place, the closest files of its folder suggested.
 */
export async function missingImages(
  config: FigatellultimateConfig,
  directory: string,
  entries: readonly Entry[],
): Promise<MissingImageDiagnostic[]> {
  const publicDirectory = config.publicDirectory ?? 'public';
  const root = join(directory, ...publicDirectory.split('/'));
  const checked = new Map<string, Promise<boolean>>();
  const diagnostics: MissingImageDiagnostic[] = [];

  for (const reference of localImageReferences(config.collections, entries)) {
    let path: string;

    try {
      path = decodeURIComponent(reference.image);
    } catch {
      path = reference.image;
    }

    const file = join(root, ...path.split('/'));
    const inside = relative(root, file);
    const found =
      inside !== '' && !inside.startsWith('..') && !isAbsolute(inside)
        ? (checked.get(file) ?? checked.set(file, exists(file)).get(file) ?? Promise.resolve(false))
        : Promise.resolve(false);

    if (await found) continue;

    const folder = posix.dirname(path);
    const names = await filesOf(join(root, ...folder.split('/')));

    diagnostics.push({
      code: 'missing-image',
      severity: 'error',
      collection: reference.collection,
      sourcePath: reference.sourcePath,
      data: { image: reference.image, field: reference.field, publicDirectory },
      suggestions: suggest(posix.basename(path), names).map((name) => posix.join(folder, name)),
    });
  }

  return diagnostics;
}
