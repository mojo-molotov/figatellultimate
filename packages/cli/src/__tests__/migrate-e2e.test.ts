import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Writable } from 'node:stream';

import { FileSystem } from '@japa/file-system';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EXIT, main } from '../main.js';

const PACKAGE = join(import.meta.dirname, '..', '..');
const WITH_FIGATELLU = join(PACKAGE, '..', 'content-collections', 'src', 'config.ts').replaceAll('\\', '/');

/** Pages and blog posts, French by default, some translated; an image next to an English page. */
const CONTENT: Readonly<Record<string, string>> = {
  'content/pages/index.mdx': '---\ntitle: Accueil\n---\nAccueil.\n',
  'content/pages/en/index.mdx': '---\ntitle: Home\n---\nHome.\n',
  'content/pages/about.mdx': '---\ntitle: À propos\n---\nÀ propos.\n',
  'content/pages/en/about.mdx': '---\ntitle: About\n---\nAbout.\n',
  'content/pages/docs/setup.mdx': '---\ntitle: Installation\n---\nInstaller.\n',
  'content/pages/en/legal/terms.mdx': '---\ntitle: Terms\n---\nTerms.\n',
  'content/pages/en/legal/diagram.png': 'png',
  'content/blog/news/bot/post-01.mdx': '---\ntitle: Le bot\n---\nLe bot.\n',
  'content/blog/news/bot/en/post-01.mdx': '---\ntitle: The bot\n---\nThe bot.\n',
};

const CONTENT_COLLECTIONS_CONFIG = `
import { defineCollection, defineConfig } from '@content-collections/core';
import * as v from 'valibot';
import { withFigatellu } from ${JSON.stringify(WITH_FIGATELLU)};

const schema = v.object({ title: v.string(), content: v.string() });
const pages = withFigatellu(defineCollection({ name: 'pages', directory: 'content/pages', include: '**/*.mdx', schema }));
const blog = withFigatellu(defineCollection({ name: 'blog', directory: 'content/blog', include: '**/*.mdx', schema }));
export default defineConfig({ content: [pages, blog] });
`;

const FIGATELLU_CONFIG = `import { join } from 'node:path';
import { defineCollection, defineConfig, defineLocales, locale, rest, segment, slug } from '@figatellu/core';
import { createContentCollectionsSource } from '@figatellu/content-collections';

export default defineConfig({
  locales: defineLocales({ list: ['fr', 'en'], default: 'fr' }),
  collections: {
    pages: defineCollection({ entry: 'page', base: '', grammar: [locale({ optional: true }), rest('path'), slug()] }),
    blog: defineCollection({
      entry: 'blogPost',
      base: 'blog',
      grammar: [segment('category'), segment('subcategory'), locale({ optional: true }), slug()],
    }),
  },
  source: createContentCollectionsSource({
    configPath: join(import.meta.dirname, 'content-collections.ts'),
    projectRoot: import.meta.dirname,
  }),
});
`;

const project = new FileSystem(join(PACKAGE, '.tmp', randomUUID()));

async function run(...argv: string[]): Promise<{ code: number; output: string }> {
  let output = '';
  const stdout = new Writable({
    write(chunk: Buffer, _encoding, done) {
      output += chunk.toString();
      done();
    },
  });
  const code = await main([...argv, '--config', join(project.basePath, 'figatellu.config.ts')], {
    stdout,
    fancy: false,
    cwd: project.basePath,
  });

  return { code, output };
}

/** Every file the author owns (content, config, redirects), by relative POSIX path: generated folders left out. */
async function tree(): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const walk = async (folder: string): Promise<void> => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);

      if (entry.isDirectory()) {
        if (!['.figatellu', '.content-collections', 'node_modules'].includes(entry.name)) await walk(path);
      } else files[relative(project.basePath, path).replaceAll('\\', '/')] = await readFile(path, 'utf8');
    }
  };

  await walk(project.basePath);

  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1)));
}

const withoutConfig = (files: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(files).filter(([path]) => path !== 'figatellu.config.ts'));

beforeAll(async () => {
  await project.create('package.json', JSON.stringify({ type: 'module' }));

  for (const [path, contents] of Object.entries(CONTENT)) await project.create(path, contents);

  await project.create('content-collections.ts', CONTENT_COLLECTIONS_CONFIG);
  await project.create('figatellu.config.ts', FIGATELLU_CONFIG);
});
afterAll(() => project.cleanup());

describe('figatellu migrate, end to end', () => {
  it('prints the plan and writes nothing without --write', async () => {
    const before = await tree();
    const { code, output } = await run('migrate', 'default-locale', 'en');

    expect(code).toBe(EXIT.ok);
    expect(output).toContain('content/pages/about.mdx → content/pages/fr/about.mdx');
    expect(output).toContain('content/pages/en/about.mdx → content/pages/about.mdx');
    expect(output).toContain("Config: defineLocales default → 'en'");
    expect(output).toContain('/docs/setup → /fr/docs/setup');
    expect(output).toContain('--write');
    expect(await tree()).toEqual(before);
    expect(output).not.toContain(project.basePath);
  }, 60_000);

  it('--write moves everything, edits the config, writes redirects.json; back again gives the same tree', async () => {
    const original = await tree();
    const there = await run('migrate', 'default-locale', 'en', '--write');

    expect(there.code).toBe(EXIT.ok);
    const migrated = await tree();

    expect(migrated['content/pages/about.mdx']).toBe(CONTENT['content/pages/en/about.mdx']);
    expect(migrated['content/pages/fr/about.mdx']).toBe(CONTENT['content/pages/about.mdx']);
    expect(migrated['content/blog/news/bot/fr/post-01.mdx']).toBe(CONTENT['content/blog/news/bot/post-01.mdx']);
    expect(migrated['figatellu.config.ts']).toBe(FIGATELLU_CONFIG.replace("default: 'fr'", "default: 'en'"));
    expect(JSON.parse(migrated['redirects.json'] ?? '[]')).toContainEqual({
      from: '/docs/setup',
      to: '/fr/docs/setup',
    });
    // The image is not an entry: it stays, reported, in the folder its page left.
    expect(migrated['content/pages/en/legal/diagram.png']).toBe('png');
    expect(there.output).toContain('content/pages/en/legal/diagram.png');
    // The migrated project builds.
    const built = await run('build');

    expect(built.code).toBe(EXIT.ok);

    const back = await run('migrate', 'default-locale', 'fr', '--write');

    expect(back.code).toBe(EXIT.ok);
    const { 'redirects.json': redirects, ...restored } = await tree();

    expect(restored).toEqual(original);
    // Composed: links to the temporary URLs lead home; the loops back to live URLs are gone.
    const table: unknown = JSON.parse(redirects ?? '[]');

    expect(table).toContainEqual({ from: '/fr/docs/setup', to: '/docs/setup' });
    expect(table).not.toContainEqual(expect.objectContaining({ from: '/docs/setup' }));
    expect(table).not.toContainEqual(expect.objectContaining({ from: '/about' }));
  }, 120_000);

  it('implicit → explicit → implicit gives the same tree, with no redirect', async () => {
    const original = await tree();
    const there = await run('migrate', 'notation', 'explicit', '--write');

    expect(there.code).toBe(EXIT.ok);
    const migrated = await tree();

    expect(migrated['content/pages/fr/index.mdx']).toBe(CONTENT['content/pages/index.mdx']);
    expect(migrated['figatellu.config.ts']).toContain("default: 'fr', notation: 'explicit'");
    expect(migrated['redirects.json']).toBe(original['redirects.json']);
    expect((await run('migrate', 'notation', 'implicit', '--write')).code).toBe(EXIT.ok);
    const restored = await tree();

    expect(restored['figatellu.config.ts']).toBe(
      FIGATELLU_CONFIG.replace("default: 'fr'", "default: 'fr', notation: 'implicit'"),
    );
    expect(withoutConfig(restored)).toEqual(withoutConfig(original));
  }, 120_000);

  it('points out the app’s route folders named after a locale, without touching them', async () => {
    await project.create('app/en/page.tsx', 'export default function Page() { return null; }\n');
    const { code, output } = await run('migrate', 'default-locale', 'en');

    expect(code).toBe(EXIT.ok);
    expect(output).toContain('app/en');
    expect(output).toContain('assume which locale is unprefixed');
    await project.remove('app');
  }, 60_000);

  it('refuses a redirects.json that is not a list of { from, to }, writing nothing', async () => {
    await project.create('redirects.json', '{"not": "a list"}');
    const before = await tree();
    const { code, output } = await run('migrate', 'default-locale', 'en', '--write');

    expect(code).toBe(EXIT.content);
    expect(output).toContain('redirects.json is not a list');
    expect(await tree()).toEqual(before);
    await project.remove('redirects.json');
  }, 60_000);

  it('refuses content with errors, and an undeclared locale, without touching anything', async () => {
    const before = await tree();
    const unknown = await run('migrate', 'default-locale', 'em', '--write');

    expect(unknown.code).toBe(EXIT.content);
    expect(unknown.output).toContain('did you mean en?');
    await project.create('content/pages/Bad.mdx', '---\ntitle: Bad\n---\n');
    const broken = await run('migrate', 'default-locale', 'en', '--write');

    expect(broken.code).toBe(EXIT.content);
    expect(broken.output).toContain('nothing moved');
    await project.remove('content/pages/Bad.mdx');
    expect(await tree()).toEqual(before);
  }, 60_000);
});
