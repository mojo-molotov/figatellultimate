import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Writable } from 'node:stream';

import { FileSystem } from '@japa/file-system';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { EXIT, main } from '../main.js';
import { builtFileOf } from '../pipeline/search.js';

const PACKAGE = join(import.meta.dirname, '..', '..');
const WITH_FIGATELLULTIMATE = join(PACKAGE, '..', 'content-collections', 'src', 'config.ts').replaceAll('\\', '/');

/** Pages in two locales (one reserved), and offers: a collection kept out of the search. */
const CONTENT: Readonly<Record<string, string>> = {
  'content/pages/index.mdx': '---\ntitle: Accueil\n---\nAccueil.\n',
  'content/pages/en/index.mdx': '---\ntitle: Home\n---\nHome.\n',
  'content/pages/docs/guide.mdx': '---\ntitle: Guide\n---\nGuide.\n',
  'content/pages/en/docs/guide.mdx': '---\ntitle: Guide\n---\nGuide.\n',
  'content/pages/lp/sign-up.mdx': '---\ntitle: Inscription\n---\nInscription.\n',
  'content/offers/spring.mdx': '---\ntitle: Printemps\n---\nPrintemps.\n',
};

const CONTENT_COLLECTIONS_CONFIG = `
import { defineCollection, defineConfig } from '@content-collections/core';
import * as v from 'valibot';
import { withFigatellultimate } from ${JSON.stringify(WITH_FIGATELLULTIMATE)};

const schema = v.object({ title: v.string(), content: v.string() });
const pages = withFigatellultimate(defineCollection({ name: 'pages', directory: 'content/pages', include: '**/*.mdx', schema }));
const offers = withFigatellultimate(defineCollection({ name: 'offers', directory: 'content/offers', include: '**/*.mdx', schema }));
export default defineConfig({ content: [pages, offers] });
`;

const FIGATELLULTIMATE_CONFIG = `
import { join } from 'node:path';
import { defineCollection, defineConfig, defineLocales, locale, rest, slug } from '@figatellultimate/core';
import { createContentCollectionsSource } from '@figatellultimate/content-collections';

export default defineConfig({
  locales: defineLocales({ list: ['fr', 'en'], default: 'fr' }),
  collections: {
    pages: defineCollection({
      entry: 'page', base: '', grammar: [locale({ optional: true }), rest('path'), slug()], reserved: ['lp/sign-up'],
    }),
    offers: defineCollection({ entry: 'offer', base: 'offers', grammar: [locale({ optional: true }), slug()], searchable: false }),
  },
  source: createContentCollectionsSource({
    configPath: join(import.meta.dirname, 'content-collections.ts'),
    projectRoot: import.meta.dirname,
  }),
});
`;

/** The HTML a static build would write for each mounted URL, its body marked for Pagefind. */
const page = (lang: string, body: string): string =>
  `<!doctype html><html><head><title>t</title></head><body><nav>Menu</nav><main lang="${lang}" data-pagefind-body>${body}</main></body></html>`;
const BUILT: Readonly<Record<string, string>> = {
  '/': page('fr', '<h1>Accueil</h1><p>Les chevaux galopent dans la prairie.</p>'),
  '/en': page('en', '<h1>Home</h1><p>The horses are running across the meadow.</p>'),
  '/docs/guide': page('fr', '<h1>Guide</h1><p>Installer la bibliothèque.</p>'),
  '/en/docs/guide': page('en', '<h1>Guide</h1><p>Installing the library.</p>'),
};

const project = new FileSystem(join(PACKAGE, '.tmp', randomUUID()));

async function run(...argv: string[]): Promise<{ code: number; output: string }> {
  let output = '';
  const stdout = new Writable({
    write(chunk: Buffer, _encoding, done) {
      output += chunk.toString();
      done();
    },
  });
  const code = await main([...argv, '--config', join(project.basePath, 'figatellultimate.config.ts')], {
    stdout,
    fancy: false,
    cwd: project.basePath,
  });

  return { code, output };
}

const entryOf = async (locale: string): Promise<unknown> =>
  JSON.parse(await readFile(join(project.basePath, 'public', 'pagefind', locale, 'pagefind-entry.json'), 'utf8'));

beforeAll(async () => {
  await project.create('package.json', JSON.stringify({ type: 'module' }));

  for (const [path, contents] of Object.entries(CONTENT)) await project.create(path, contents);

  await project.create('content-collections.ts', CONTENT_COLLECTIONS_CONFIG);
  await project.create('figatellultimate.config.ts', FIGATELLULTIMATE_CONFIG);
});
beforeEach(async () => {
  for (const [url, html] of Object.entries(BUILT)) await project.create(`site/${builtFileOf(url)}`, html);

  // A built page that is not an entry (an error page): never indexed.
  await project.create('site/_not-found.html', page('fr', '<p>Introuvable</p>'));
});
afterAll(() => project.cleanup());

describe('builtFileOf', () => {
  it.each([
    ['/', 'index.html'],
    ['/en', 'en.html'],
    ['/en/docs/guide', 'en/docs/guide.html'],
    ['/docs/', 'docs.html'],
  ])('%s → %s', (url, file) => {
    expect(builtFileOf(url)).toBe(file);
  });
});

describe('figatellultimate search, end to end', () => {
  it('indexes the mounted, searchable entries: one bundle per locale, with its language', async () => {
    const { code, output } = await run('search', '--site', 'site');

    expect(output).toContain('en: 2 pages');
    expect(output).toContain('fr: 2 pages');
    expect(output).toContain('1 not searchable');
    expect(code).toBe(EXIT.ok);
    // fr: the home and the guide; the reserved sign-up page, the offer and the error page are not indexed.
    // One language per bundle: `languages` holds that locale only.
    expect(await entryOf('fr')).toMatchObject({ languages: { fr: { page_count: 2 } } });
    expect(await entryOf('fr')).not.toHaveProperty(['languages', 'en']);
    expect(await entryOf('en')).toHaveProperty(['languages', 'en']);
    expect(await entryOf('en')).not.toHaveProperty(['languages', 'fr']);
    expect((await readdir(join(project.basePath, 'public', 'pagefind'))).sort()).toEqual(['en', 'fr']);
  }, 60_000);

  it('--locale-folders reads every locale from its own folder, the default one included (next-intl)', async () => {
    const LOCALIZED: Readonly<Record<string, string>> = {
      '/fr': BUILT['/'] ?? '',
      '/en': BUILT['/en'] ?? '',
      '/fr/docs/guide': BUILT['/docs/guide'] ?? '',
      '/en/docs/guide': BUILT['/en/docs/guide'] ?? '',
    };

    for (const [path, html] of Object.entries(LOCALIZED)) await project.create(`localized/${builtFileOf(path)}`, html);

    const { code, output } = await run(
      'search',
      '--site',
      'localized',
      '--out',
      'public/localized',
      '--locale-folders',
    );

    expect(output).toContain('fr: 2 pages');
    expect(code).toBe(EXIT.ok);
    // Without the option, the French pages are looked for at their public URL, and missing.
    const plain = await run('search', '--site', 'localized', '--out', 'public/localized');

    expect(plain.code).toBe(EXIT.content);
    expect(plain.output).toContain('/docs/guide (localized/docs/guide.html) missing-built-page');
  }, 60_000);

  it('fails when a mounted entry was not built statically, without an absolute path', async () => {
    await project.remove(`site/${builtFileOf('/en/docs/guide')}`);
    const { code, output } = await run('search', '--site', 'site');

    expect(code).toBe(EXIT.content);
    expect(output).toContain('/en/docs/guide (site/en/docs/guide.html) missing-built-page');
    expect(output).toContain('build the site statically first');
    expect(output).not.toContain(project.basePath);
    expect(output).not.toContain(encodeURIComponent(project.basePath));
  }, 60_000);

  it('fails when an entry has no data-pagefind-body element, with advice', async () => {
    await project.create(
      `site/${builtFileOf('/docs/guide')}`,
      '<!doctype html><html><body><main>Guide</main></body></html>',
    );
    const { code, output } = await run('search', '--site', 'site');

    expect(code).toBe(EXIT.content);
    expect(output).toContain('/docs/guide (site/docs/guide.html) empty-search-content');
    expect(output).toContain('data-pagefind-body');
  }, 60_000);
});
