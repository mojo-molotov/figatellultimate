/**
 * The watch's sync plan, pure: from what Content Collections holds, what the disk holds and what the watcher
 * reported, the operations that bring Content Collections in line, or one full rescan.
 *
 * Invariants (`sync-plan.test.ts`): never deletes a file Content Collections does not hold; never empties a
 * collection whose listing failed; skipped files are not retried unless they change.
 */
/** A file of a collection, by its collection-relative POSIX path. */
export interface CollectionFile {
  readonly collection: string;
  readonly sourcePath: string;
}

type Modification = 'create' | 'update' | 'delete';

interface SyncOperation extends CollectionFile {
  readonly modification: Modification;
}

/** What Content Collections holds and skips, per collection, as of its last build. */
export interface SyncState {
  /** Files it holds: delivered documents and files failing validation. */
  readonly held: ReadonlyMap<string, ReadonlySet<string>>;
  /** Listed files it does not hold after building (other extensions, unparsable files): not retried unless changed. */
  readonly skipped: ReadonlyMap<string, ReadonlySet<string>>;
}

/** What a run knows: the state, the disk's listing, the reported paths, and when to rescan instead. */
export interface SyncInput extends SyncState {
  /** What figatellultimate just listed on disk, per collection: the truth (collections whose listing failed are absent). */
  readonly listed: Readonly<Record<string, readonly string[]>>;
  /** Files the watcher reported since the last run (create, change or delete alike). */
  readonly changed: readonly CollectionFile[];
  /** Above this many operations, one full rescan is cheaper than syncing file by file (each sync rebuilds). */
  readonly threshold: number;
}

/** One full rescan, or the file operations to apply in order. */
export type SyncPlan =
  { readonly kind: 'rescan' } | { readonly kind: 'sync'; readonly operations: readonly SyncOperation[] };

const EMPTY: ReadonlySet<string> = new Set();

/**
 * The operations that bring Content Collections in line with the disk.
 *
 * @param input - What Content Collections holds and skipped, the disk's listing per collection, the files the watcher
 *   reported, and the rescan threshold.
 * @returns A rescan above the threshold, else the operations: reported changes applied from the disk's state (a
 *   create then a delete is nothing), files the listing shows the watcher missed, and never a delete of a file
 *   Content Collections does not hold (its `sync('delete')` would remove another one) nor of a collection whose
 *   listing failed.
 *
 * @example
 * planSync({ held, skipped, listed: { blog: ['news/a.mdx'] }, changed: [{ collection: 'blog', sourcePath: 'news/a.mdx' }], threshold: 20 });
 * // { kind: 'sync', operations: [{ collection: 'blog', sourcePath: 'news/a.mdx', modification: 'update' }] }
 */
export function planSync(input: SyncInput): SyncPlan {
  const operations: SyncOperation[] = [];

  for (const [collection, files] of Object.entries(input.listed)) {
    const onDisk = new Set(files);
    const held = input.held.get(collection) ?? EMPTY;
    const skipped = input.skipped.get(collection) ?? EMPTY;
    const changed = new Set(input.changed.filter((file) => file.collection === collection).map((f) => f.sourcePath));
    const candidates = new Set([
      ...changed,
      ...files.filter((path) => !held.has(path) && !skipped.has(path)),
      ...[...held].filter((path) => !onDisk.has(path)),
    ]);

    for (const sourcePath of [...candidates].sort()) {
      const exists = onDisk.has(sourcePath);
      const isHeld = held.has(sourcePath);
      const modification: Modification | undefined = exists
        ? isHeld
          ? 'update'
          : 'create'
        : isHeld
          ? 'delete'
          : undefined;

      if (modification !== undefined) operations.push({ collection, sourcePath, modification });
    }
  }

  return operations.length > input.threshold ? { kind: 'rescan' } : { kind: 'sync', operations };
}

/**
 * The state after a build.
 *
 * @param previous - The state before, `undefined` for a first build.
 * @param listed - What was listed per collection, `undefined` when the build had no listing.
 * @param held - The files Content Collections reported holding.
 * @returns The held files as reported, and as skipped the listed files it does not hold.
 */
export function stateAfterBuild(
  previous: SyncState | undefined,
  listed: Readonly<Record<string, readonly string[]>> | undefined,
  held: readonly CollectionFile[],
): SyncState {
  const heldBy = new Map<string, Set<string>>();

  for (const { collection, sourcePath } of held) {
    const set = heldBy.get(collection) ?? new Set<string>();

    set.add(sourcePath);
    heldBy.set(collection, set);
  }

  const skipped = new Map(previous?.skipped ?? []);

  for (const [collection, files] of Object.entries(listed ?? {})) {
    const holding = heldBy.get(collection) ?? EMPTY;

    skipped.set(collection, new Set(files.filter((path) => !holding.has(path))));
  }

  return { held: heldBy, skipped };
}
