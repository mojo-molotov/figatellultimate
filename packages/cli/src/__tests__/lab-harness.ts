// Watch lab harness: a disposable project watched by `figatellultimate watch`, and the oracle that compares what the
// watch wrote with a build from scratch. Shared by the lab suites (`*.lab.test.ts`).
import { randomUUID } from 'node:crypto';
import { cp, readdir, readFile, rm } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { Writable } from 'node:stream';

import { FileSystem } from '@japa/file-system';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EXIT, main } from '../main.js';

const PACKAGE = join(import.meta.dirname, '..', '..');

export const WITH_FIGATELLULTIMATE: string = join(PACKAGE, '..', 'content-collections', 'src', 'config.ts').replaceAll(
  '\\',
  '/',
);
const SCENARIO_TIMEOUT = 60_000;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Every file under `directory`, by POSIX path: the generated tree as data. */
async function snapshot(directory: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  let entries;

  try {
    entries = await readdir(directory, { recursive: true, withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries.filter((e) => e.isFile())) {
    const path = join(entry.parentPath, entry.name);

    files[relative(directory, path).split(sep).join('/')] = await readFile(path, 'utf8');
  }

  return files;
}

function capture(): { stdout: Writable; output: () => string } {
  let output = '';
  const stdout = new Writable({
    write(chunk: Buffer, _encoding, done) {
      output += chunk.toString();
      done();
    },
  });

  return { stdout, output: () => output };
}

/** A scenario: a burst of changes; its final state must be valid (the oracle compares two successful builds). */
export type Scenario = readonly [name: string, act: () => Promise<unknown>];

export interface Lab {
  /** Absolute path of a project file, from a POSIX path. */
  at(path: string): string;
  /**
   * Creates the project, watches it, and replays the scenarios in order: after each one, the watched `.figatellultimate/`
   * must be byte-identical to a build from scratch of a copy (its own config module, hence a new content source).
   */
  run(title: string, scenarios: readonly Scenario[]): void;
}

/** A disposable project (`files`, configs included) for the watch lab. */
export function createLab(files: Readonly<Record<string, string>>): Lab {
  const tmp = join(PACKAGE, '.tmp', `watch-lab-${randomUUID()}`);
  const project = new FileSystem(join(tmp, 'project'));
  const at = (path: string): string => join(project.basePath, ...path.split('/'));
  const controller = new AbortController();
  const watchOutput = capture();
  let watchExit: Promise<number> | undefined;
  let fresh = 0;

  /** Waits until the watch output has been quiet for a while and ends waiting for changes. */
  async function settle(quiet = 2_500): Promise<void> {
    let length = -1;
    let since = Date.now();

    for (;;) {
      await sleep(100);
      const output = watchOutput.output();

      if (output.length !== length) {
        length = output.length;
        since = Date.now();
      } else if (Date.now() - since >= quiet && output.trimEnd().endsWith('(Ctrl+C to stop)')) {
        return;
      }
    }
  }

  async function freshBuild(): Promise<Record<string, string>> {
    fresh += 1;
    const copy = join(tmp, `fresh-${String(fresh)}`);

    await cp(project.basePath, copy, { recursive: true, filter: (source) => !source.includes('.figatellultimate') });
    const { stdout } = capture();

    await main(['build', '--mode', 'development', '--config', join(copy, 'figatellultimate.config.ts')], {
      stdout,
      fancy: false,
      cwd: copy,
    });

    return snapshot(join(copy, '.figatellultimate'));
  }

  return {
    at,
    run(title, scenarios) {
      beforeAll(async () => {
        for (const [path, contents] of Object.entries(files)) await project.create(path, contents);

        watchExit = main(['watch', '--config', at('figatellultimate.config.ts')], {
          stdout: watchOutput.stdout,
          fancy: false,
          cwd: project.basePath,
          signal: controller.signal,
        });
        await settle();
      }, SCENARIO_TIMEOUT);

      afterAll(async () => {
        controller.abort();
        expect(await watchExit).toBe(EXIT.ok);
        await rm(tmp, { recursive: true, force: true });
      }, SCENARIO_TIMEOUT);

      describe(title, () => {
        for (const [name, act] of scenarios) {
          it(
            name,
            async () => {
              await act();
              await settle();
              const watched = await snapshot(at('.figatellultimate'));
              const expected = await freshBuild();

              // Precondition: the fresh build produced something, so two empty trees cannot pass.
              expect(Object.keys(expected).length).toBeGreaterThan(0);
              expect(watched).toEqual(expected);
            },
            SCENARIO_TIMEOUT,
          );
        }
      });
    },
  };
}
