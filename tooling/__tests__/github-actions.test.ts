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

    // GitHub keeps one pending run per group, a newer one cancelling it: a run of main waiting behind another (a
    // rerun) was cancelled by the next commit. Outside a pull request, a group per commit.
    expect(readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')).toMatch(
      /^concurrency:\n {2}group: ci-\$\{\{ github\.event_name == 'pull_request' && github\.ref \|\| github\.sha \}\}$/m,
    );
  });

  it("keeps the reports branch under GitHub's file limit, and from growing: compressed histories, a size guard, one commit", () => {
    const publish = readFileSync(join(ROOT, '.github', 'actions', 'reports-publish', 'action.yml'), 'utf8');

    expect(publish).toMatch(/gunzip -c "\$history" > history\.jsonl/);
    expect(publish).toMatch(/gzip -9 -c history\.jsonl > "\$history"/);
    expect(publish).toMatch(/-size \+90M/);
    expect(publish).toContain('--orphan allure-reports');
    expect(publish).toContain('git push -q --force');
  });

  it("runs Playwright's image pinned by digest, of the repository's playwright release, so that its browsers match", () => {
    const manifest: unknown = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const dependencies: unknown =
      typeof manifest === 'object' && manifest !== null ? Reflect.get(manifest, 'devDependencies') : undefined;
    const version: unknown =
      typeof dependencies === 'object' && dependencies !== null ? Reflect.get(dependencies, 'playwright') : undefined;

    // Precondition: the repository's playwright was read.
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    const images = files.flatMap((file) => [
      ...readFileSync(file, 'utf8').matchAll(/image: (mcr\.microsoft\.com\/playwright\S*)/g),
    ]);

    // Precondition: the workflows running browsers use it.
    expect(images.length).toBeGreaterThanOrEqual(3);

    for (const [, image] of images) {
      expect(image).toMatch(
        new RegExp(`^mcr\\.microsoft\\.com/playwright:v${String(version)}-[a-z]+@sha256:[0-9a-f]{64}$`),
      );
    }
  });
});
