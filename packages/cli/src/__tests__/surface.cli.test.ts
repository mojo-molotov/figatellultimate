/**
 * The command line's surface, as a user meets it: the built `figatellultimate` binary run in a real process, on a disposable
 * project, its output and exit code read as a terminal would show them (cli-testing-library).
 *
 *     pnpm build ──> node packages/cli/dist/bin.js <args> (cwd: a disposable project)
 *                        └──> output (plain: not a TTY) + exit code, asserted here
 *
 * Key design decisions:
 *     - The CLI is a user interface, not a function: help, usage errors, exit codes, what a command prints and
 *       writes, and how `watch` stops are checked here only, against the real binary. In-process tests keep what
 *       needs state or precise data: argument parsing (`args.test.ts`), the typed output, the atomic writes, the
 *       watch's serialized runs.
 *     - cli-testing-library over a cram tool (prysk): the same "a command, then what it prints" tests, without a
 *       Python toolchain in a Node project, run by vitest on every OS, Windows included; and it waits for the output
 *       of a long-running process (`watch`) and sends it signals.
 *     - The built binary and the packages' `dist`, as an installed CLI resolves them: `pnpm build` first
 *       (`pnpm test:cli`, and in CI after the build).
 *     - The help is not compared whole: a change of wording would fail it for nothing. Each command must be listed,
 *       and a usage error must print its problem first, then the help.
 *
 * Limitations: the fancy terminal UI (colors, spinners) is not covered, only the plain output of a non-TTY; stopping
 * `watch` by a signal is not checked on Windows, which has no POSIX signals.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FileSystem } from '@japa/file-system';
import { cleanup, render, type RenderResult } from 'cli-testing-library';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const PACKAGE = join(import.meta.dirname, '..', '..');
const BIN = join(PACKAGE, 'dist', 'bin.js');
const manifest: unknown = JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf8'));
const version =
  typeof manifest === 'object' && manifest !== null && 'version' in manifest ? manifest.version : undefined;

const project = new FileSystem(join(PACKAGE, '.tmp', randomUUID()));

/** Sample pages: French by default, English under `en/`, `about` in French only. */
const CONTENT: Readonly<Record<string, string>> = {
  'content/pages/index.mdx': '---\ntitle: Accueil\n---\nAccueil.\n',
  'content/pages/en/index.mdx': '---\ntitle: Home\n---\nHome.\n',
  'content/pages/about.mdx': '---\ntitle: À propos\n---\nÀ propos.\n',
};

const CONTENT_COLLECTIONS_CONFIG = `
import { defineCollection, defineConfig } from '@content-collections/core';
import { withFigatellultimate } from '@figatellultimate/content-collections/config';
import * as v from 'valibot';

const pages = withFigatellultimate(
  defineCollection({ name: 'pages', directory: 'content/pages', include: '**/*.mdx', schema: v.object({ title: v.string(), content: v.string() }) }),
);
export default defineConfig({ content: [pages] });
`;

const FIGATELLULTIMATE_CONFIG = `
import { join } from 'node:path';
import { createContentCollectionsSource } from '@figatellultimate/content-collections';
import { defineCollection, defineConfig, defineLocales, locale, rest, slug } from '@figatellultimate/core';

export default defineConfig({
  locales: defineLocales({ list: ['fr', 'en'], default: 'fr' }),
  splitRoutes: false,
  collections: {
    pages: defineCollection({ entry: 'page', base: '', grammar: [locale({ optional: true }), rest('path'), slug()] }),
  },
  source: createContentCollectionsSource({
    configPath: join(import.meta.dirname, 'content-collections.ts'),
    projectRoot: import.meta.dirname,
  }),
});
`;

/** Starts the binary in the project, as a user would type `figatellultimate <args>`. */
const start = (...args: string[]): Promise<RenderResult> =>
  render(process.execPath, [BIN, ...args], {
    cwd: project.basePath,
    spawnOpts: { env: { ...process.env, NO_COLOR: '1' } },
  });

/** Runs the binary to its end: its exit code and everything it printed. */
async function figatellultimate(...args: string[]): Promise<{ readonly code: number; readonly output: string }> {
  const instance = await start(...args);
  const code = await vi.waitFor(
    () => {
      const exit = instance.hasExit();

      if (exit === null) throw new Error('still running');

      return exit.exitCode;
    },
    { timeout: 60_000, interval: 50 },
  );

  return { code, output: instance.getStdallStr() };
}

/** The help's first line: what a usage error must end with. */
const USAGE = 'Usage: figatellultimate <command> [options]';

beforeAll(async () => {
  await project.create('package.json', JSON.stringify({ type: 'module' }));

  for (const [path, contents] of Object.entries(CONTENT)) await project.create(path, contents);

  await project.create('content-collections.ts', CONTENT_COLLECTIONS_CONFIG);
  await project.create('figatellultimate.config.ts', FIGATELLULTIMATE_CONFIG);
});
afterEach(() => cleanup());
afterAll(() => project.cleanup());

describe('figatellultimate: help and usage', () => {
  it('--help lists every command and exits 0', async () => {
    const { code, output } = await figatellultimate('--help');

    expect(code).toBe(0);
    expect(output).toContain(USAGE);

    for (const command of ['build', 'check', 'watch', 'search', 'migrate']) expect(output).toMatch(`\n  ${command} `);
  });

  it('--version prints the package version and exits 0', async () => {
    const { code, output } = await figatellultimate('--version');

    expect(code).toBe(0);
    expect(output.trim()).toBe(version);
  });

  it.each([
    [[], 'Missing command.'],
    [['biuld'], 'Unknown command "biuld".\n→ did you mean build?'],
    [['build', 'extra'], 'Unexpected argument "extra".'],
    [['search'], 'The search command needs --site <built HTML directory>'],
  ])('%j: the problem, then the help, exit 2', async (args, problem) => {
    const { code, output } = await figatellultimate(...args);

    expect(code).toBe(2);
    expect(output).toContain(problem);
    expect(output.indexOf(problem)).toBeLessThan(output.indexOf(USAGE));
  });

  it('a missing config is a usage problem, with what to do', async () => {
    const { code, output } = await figatellultimate('build', '--config', 'missing.config.ts');

    expect(code).toBe(2);
    expect(output).toContain('No config file at missing.config.ts.');
    expect(output).toContain('create figatellultimate.config.ts, or pass --config <path>');
  });
});

describe('figatellultimate: commands', () => {
  it('build writes the generated modules and exits 0; a second build rewrites nothing', async () => {
    const first = await figatellultimate('build');

    expect(first.output).toContain('✓ 3 entries · 0 excluded (production)');
    expect(first.code).toBe(0);
    expect(await project.exists('.figatellultimate/pages/index.js')).toBe(true);

    const second = await figatellultimate('build');

    expect(second.code).toBe(0);
    expect(second.output).toMatch(/0 written · \d+ unchanged · 0 removed/);
  });

  it('check reports a content error with where, why and how to fix it, exits 1 and writes nothing', async () => {
    await project.create('content/pages/Bad Name.mdx', '---\ntitle: Bad\n---\nBad.\n');

    try {
      const { code, output } = await figatellultimate('check');

      expect(code).toBe(1);
      expect(output).toContain('content/pages/Bad Name.mdx');
      expect(output).toContain('rename it to "bad-name"');
      expect(await project.exists('.figatellultimate/pages/entries/fr/bad-name.js')).toBe(false);
    } finally {
      await project.remove('content/pages/Bad Name.mdx');
    }
  });

  it('migrate prints its plan and moves nothing without --write', async () => {
    const { code, output } = await figatellultimate('migrate', 'default-locale', 'en');

    expect(code).toBe(0);
    expect(output).toContain('/about → /fr/about');
    expect(await project.exists('content/pages/about.mdx')).toBe(true);
  });

  it.skipIf(process.platform === 'win32')(
    'watch rebuilds on every content change, removes what it no longer produces, and stops cleanly on SIGTERM',
    async () => {
      const watch = await start('watch');

      expect(await watch.findByText('Watching for changes', {}, { timeout: 30_000 })).toBeTruthy();
      // Content Collections' watcher needs a moment before it sees new files.
      await new Promise((resolve) => setTimeout(resolve, 500));
      await project.create('content/pages/watched.mdx', '---\ntitle: Watched\n---\nWatched.\n');
      await vi.waitFor(
        async () => {
          expect(await project.exists('.figatellultimate/pages/entries/fr/watched.js')).toBe(true);
        },
        { timeout: 30_000, interval: 100 },
      );
      await project.remove('content/pages/watched.mdx');
      await vi.waitFor(
        async () => {
          expect(await project.exists('.figatellultimate/pages/entries/fr/watched.js')).toBe(false);
        },
        { timeout: 30_000, interval: 100 },
      );

      watch.process.kill('SIGTERM');
      const exit = await vi.waitFor(
        () => {
          const exited = watch.hasExit();

          if (exited === null) throw new Error('still watching');

          return exited.exitCode;
        },
        { timeout: 30_000 },
      );

      expect(exit).toBe(0);
      expect(watch.getStdallStr()).toContain('Stopped watching');
    },
  );
});
