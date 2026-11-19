import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Writable } from 'node:stream';

import { FileSystem } from '@japa/file-system';
import { Project, ts } from 'ts-morph';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../input/load-config.js';
import { EXIT, main } from '../main.js';
import { runOnce } from '../pipeline/run.js';

const PACKAGE = join(import.meta.dirname, '..', '..');
const WITH_FIGATELLULTIMATE = join(PACKAGE, '..', 'content-collections', 'src', 'config.ts').replaceAll('\\', '/');

/** Sample pages, a missing English translation (`about`) included. */
const CONTENT: Readonly<Record<string, string>> = {
  'content/pages/index.mdx': '---\ntitle: Home\n---\nHome.\n',
  'content/pages/en/index.mdx': '---\ntitle: Home (en)\n---\nHome (en).\n',
  'content/pages/lp/sign-up.mdx': '---\ntitle: Sign up\n---\nSign up.\n',
  'content/pages/en/lp/sign-up.mdx': '---\ntitle: Sign up (en)\n---\nSign up (en).\n',
  'content/pages/about.mdx': '---\ntitle: About\n---\nAbout.\n',
};

const CONTENT_COLLECTIONS_CONFIG = `
import { defineCollection, defineConfig } from '@content-collections/core';
import * as v from 'valibot';
import { withFigatellultimate } from ${JSON.stringify(WITH_FIGATELLULTIMATE)};

const pages = withFigatellultimate(
  defineCollection({ name: 'pages', directory: 'content/pages', include: '**/*.mdx', schema: v.object({ title: v.string(), content: v.string() }) }),
);
export default defineConfig({ content: [pages] });
`;

const FIGATELLULTIMATE_CONFIG = `
import { join } from 'node:path';
import { defineCollection, defineConfig, defineLocales, locale, rest, slug } from '@figatellultimate/core';
import { createContentCollectionsSource } from '@figatellultimate/content-collections';

export default defineConfig({
  locales: defineLocales({ list: ['fr', 'en'], default: 'fr' }),
  collections: {
    pages: defineCollection({ entry: 'page', base: '', grammar: [locale({ optional: true }), rest('path'), slug()] }),
  },
  source: createContentCollectionsSource({
    configPath: join(import.meta.dirname, 'content-collections.ts'),
    projectRoot: import.meta.dirname,
  }),
});
`;

const project = new FileSystem(join(PACKAGE, '.tmp', randomUUID()));

/** Runs the CLI in process to completion, with plain output, on the project's config. */
async function run(...argv: string[]): Promise<{ code: number; output: string }> {
  let output = '';
  const stdout = new Writable({
    write(chunk: Buffer, _encoding, done) {
      output += chunk.toString();
      done();
    },
  });
  const config = ['--config', join(project.basePath, 'figatellultimate.config.ts')];
  const code = await main([...argv, ...config], { stdout, fancy: false, cwd: project.basePath });

  return { code, output };
}

/** Typechecks an app file against the generated modules, on disk (the data type comes from the user's schema). */
function typecheck(app: string): string[] {
  const tsProject = new Project({
    compilerOptions: {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      allowImportingTsExtensions: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      // Workspace packages resolve through their sources, so the check never depends on a prior build.
      customConditions: ['@figatellultimate/source'],
    },
  });

  tsProject.addSourceFilesAtPaths(join(project.basePath, '.figatellultimate', '**', '*.ts'));
  tsProject.createSourceFile(join(project.basePath, 'app.ts'), app, { overwrite: true });

  return tsProject
    .getPreEmitDiagnostics()
    .map(
      (d) =>
        `${d.getSourceFile()?.getBaseName() ?? '?'}:${String(d.getLineNumber())} ${ts.flattenDiagnosticMessageText(d.compilerObject.messageText, ' ')}`,
    );
}

beforeAll(async () => {
  await project.create(
    'package.json',
    JSON.stringify({ type: 'module', imports: { '#figatellultimate/*': './.figatellultimate/*/index.js' } }),
  );

  for (const [path, contents] of Object.entries(CONTENT)) await project.create(path, contents);

  await project.create('content-collections.ts', CONTENT_COLLECTIONS_CONFIG);
  await project.create('figatellultimate.config.ts', FIGATELLULTIMATE_CONFIG);
});
afterAll(() => project.cleanup());

describe('figatellultimate build, end to end', () => {
  it('builds the generated modules: JavaScript with declarations, entry modules without', async () => {
    expect(await run('build')).toMatchObject({ code: EXIT.ok });
    expect(await project.exists('.figatellultimate/pages/index.d.ts')).toBe(true);
    expect(await project.exists('.figatellultimate/locales/index.js')).toBe(true);
    expect(await project.exists('.figatellultimate/pages/entries/en/lp/sign-up.js')).toBe(true);
    // Entry modules have no declaration: an app's typecheck never reaches them.
    expect(await project.exists('.figatellultimate/pages/entries/en/lp/sign-up.d.ts')).toBe(false);
  }, 60_000);

  it('generates precise getters, typed with the user’s schema', () => {
    const app = `
import { getPage, findPage, type Page } from './.figatellultimate/pages/index.js';
import type { Locale } from './.figatellultimate/locales/index.js';

declare const anyLocale: Locale;
export async function ok(): Promise<string> {
  const page: Page = await getPage({ locale: anyLocale, path: 'lp/sign-up' });
  const title: string = page.data.title; // the schema's type, through Content Collections (typeSource)
  void (await findPage({ locale: 'de', path: 'nope' }));
  return title;
}
export async function rejected(): Promise<void> {
  // @ts-expect-error 'about' misses its English translation
  await getPage({ locale: anyLocale, path: 'about' });
  // @ts-expect-error unknown path
  await getPage({ locale: 'fr', path: 'nonexistent' });
}
`;

    expect(typecheck(app)).toEqual([]);
  }, 60_000);

  it('an aborted run never writes: a stale generation cannot overwrite a newer one (watch)', async () => {
    await project.create('content/pages/new-page.mdx', '---\ntitle: New\n---\nNew.\n');

    try {
      const loaded = await loadConfig(join(project.basePath, 'figatellultimate.config.ts'), project.basePath);

      if (!loaded.ok) throw new Error('config should load');

      const controller = new AbortController();

      controller.abort();
      await expect(
        runOnce({
          config: loaded.value.config,
          directory: loaded.value.directory,
          mode: 'production',
          write: true,
          signal: controller.signal,
        }),
      ).rejects.toThrow();
      expect(await project.exists('.figatellultimate/pages/entries/fr/new-page.js')).toBe(false);
    } finally {
      await project.remove('content/pages/new-page.mdx');
    }
  }, 60_000);

  it('a build removes a header-marked generated file it does not produce', async () => {
    // A module carrying the generated header, at a path the build does not produce (it emits `.js`).
    await project.create(
      '.figatellultimate/pages/index.ts',
      '// Generated by figatellultimate. Do not edit: run `figatellultimate build` instead.\n',
    );
    const { code } = await run('build');

    expect(code).toBe(EXIT.ok);
    expect(await project.exists('.figatellultimate/pages/index.ts')).toBe(false);
    expect(await project.exists('.figatellultimate/pages/index.js')).toBe(true);
  }, 60_000);

  it('never writes an absolute path into the generated modules', async () => {
    const generated = await project.readDir('.figatellultimate');

    for (const entry of generated.filter((e) => e.dirent.isFile())) {
      expect(await project.contents(`.figatellultimate/${entry.path}`)).not.toContain(project.basePath);
    }
  });
});
