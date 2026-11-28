/**
 * `@figatellultimate/fs-node`: the Node file system adapters of figatellultimate's ports, used by the CLI.
 *
 *     createNodePathLister ──> PathLister (core's port): what files a content folder holds
 *     createNodeFileWriter ──> FileWriter: the generated files written atomically, changed ones only
 *
 * Invariants: see `path-lister.ts` and `file-writer.ts`.
 */
export { createNodeFileWriter, type CommitStats, type FileWriter, type GeneratedFile } from './file-writer.js';
export { createNodePathLister } from './path-lister.js';
