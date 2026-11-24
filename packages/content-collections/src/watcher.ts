/**
 * The adapter's own file watcher: native recursive `fs.watch` (Node ≥ 24: each platform's own events,
 * ReadDirectoryChangesW on Windows, inotify on Linux), one handle per root.
 *
 * Key design decision: one handle on the root, never one per folder. Windows refuses to rename or move a folder
 * whose descendant is watched: with a watcher per folder (chokidar, Content Collections' own), an author could not
 * rename a content folder while `figatellultimate watch` ran. The watcher only signals that something moved; the listing's
 * diff finds what.
 */
import { watch, type FSWatcher } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** Below a watched root, Content Collections never reads `node_modules` nor hidden files or folders. */
const isIgnored = (relativeName: string): boolean =>
  relativeName.split(/[\\/]/).some((segment) => segment === 'node_modules' || segment.startsWith('.'));

/**
 * Watches the collections' roots and a few files (the config).
 *
 * @param roots - The collections' absolute roots: one native recursive watcher each.
 * @param files - Absolute files to watch, through their folder (editors often save by replacing the file).
 * @param onPath - Called with each changed path: a file, or only a folder when a folder moves (the listing's diff
 *   finds the files), or the root itself when the platform gives no name.
 * @returns A handle to stop watching.
 *
 * @example
 * const watcher = watchFiles([blogRoot], [configPath], (path) => reported.add(path));
 * watcher.close();
 */
export function watchFiles(
  roots: readonly string[],
  files: readonly string[],
  onPath: (absolutePath: string) => void,
): { close(): void } {
  const watchers: FSWatcher[] = [];
  const add = (watcher: FSWatcher): void => {
    // A root removed while watched: the next listing reports it; the watch itself keeps running.
    watcher.on('error', () => undefined);
    watchers.push(watcher);
  };

  for (const root of roots) {
    try {
      add(
        watch(root, { recursive: true, persistent: true }, (_event, name) => {
          if (name === null) onPath(root);
          else if (!isIgnored(name)) onPath(join(root, name));
        }),
      );
    } catch {
      // Missing root: the listing reports it (`cannot-list-directory`); nothing to watch until the next start.
    }
  }

  // Single files are watched through their folder: editors often save by replacing the file, which ends a file watch.
  for (const file of files) {
    add(
      watch(dirname(file), { persistent: true }, (_event, name) => {
        if (name === null || name === basename(file)) onPath(file);
      }),
    );
  }

  return {
    close() {
      for (const watcher of watchers) watcher.close();
    },
  };
}
