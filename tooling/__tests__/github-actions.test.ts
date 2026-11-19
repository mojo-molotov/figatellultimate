import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');

/** Every workflow and composite action file under `.github/`. */
const files = readdirSync(join(ROOT, '.github'), { recursive: true, encoding: 'utf8' })
  .filter((path) => /\.ya?ml$/.test(path))
  .map((path) => join(ROOT, '.github', path));

/** Every `uses:` of those files, where it is and what follows it on its line. */
const uses = files.flatMap((file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line, index) => {
      const match = /^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/.exec(line);

      return match === null
        ? []
        : [{ at: `${relative(ROOT, file)}:${String(index + 1)}`, action: match[1] ?? '', rest: match[2] ?? '' }];
    }),
);

/** A reference GitHub cannot move: a full commit SHA, its version beside it in a comment. */
const PINNED = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/;
const VERSION_COMMENT = /^\s+#\s*v\d+\.\d+\.\d+\s*$/;

describe('GitHub Actions', () => {
  it('reads the workflows and their actions', () => {
    // Precondition: the files were found and their steps read.
    expect(files.length).toBeGreaterThan(1);
    expect(uses.length).toBeGreaterThan(1);
  });

  it("pins every action not from GitHub's actions/ to a commit, its version in a comment (supply chain)", () => {
    const loose = uses
      .filter(({ action }) => !action.startsWith('actions/') && !action.startsWith('./'))
      .filter(({ action, rest }) => !PINNED.test(action) || !VERSION_COMMENT.test(rest))
      .map(({ at, action }) => `${at} ${action}`);

    expect(loose).toEqual([]);
  });

  it('runs every job of a matrix to its end, whatever another one did: each is an environment of its own', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const matrices = source.match(/^\s+matrix:/gm)?.length ?? 0;

      expect(source.match(/^\s+fail-fast: false$/gm)?.length ?? 0, relative(ROOT, file)).toBe(matrices);
    }
  });

  it('never cancels a run of main for a newer commit: only a pull request replaces its older run', () => {
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), relative(ROOT, file)).not.toMatch(/cancel-in-progress: true/);
    }
  });
});
