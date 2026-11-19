// Content-derived messages acceptance: adding a folder breaks every locale, at build time and at type level, until translated.
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Writable } from 'node:stream';

import { FileSystem } from '@japa/file-system';
import { Project, ts } from 'ts-morph';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EXIT, main } from '../main.js';

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

/** Nested texts, as use-intl takes them. */
type Texts = { readonly [key: string]: string | Texts };
const isMessages = (value: unknown): value is Texts =>
  isRecord(value) && Object.values(value).every((child) => typeof child === 'string' || isMessages(child));

const PACKAGE = join(import.meta.dirname, '..', '..');
const WITH_FIGATELLULTIMATE = join(PACKAGE, '..', 'content-collections', 'src', 'config.ts').replaceAll('\\', '/');

const CONTENT_COLLECTIONS_CONFIG = `
import { defineCollection, defineConfig } from '@content-collections/core';
import * as v from 'valibot';
import { withFigatellultimate } from ${JSON.stringify(WITH_FIGATELLULTIMATE)};

const blog = withFigatellultimate(defineCollection({
  name: 'blog', directory: 'content/blog', include: '**/*.mdx',
  schema: v.object({ title: v.string(), content: v.string() }),
}));
export default defineConfig({ content: [blog] });
`;

const FIGATELLULTIMATE_CONFIG = `
import { join } from 'node:path';
import { defineCollection, defineConfig, defineLocales, locale, segment, slug } from '@figatellultimate/core';
import { createContentCollectionsSource } from '@figatellultimate/content-collections';

export default defineConfig({
  locales: defineLocales({ list: { fr: { label: 'Français' }, en: { label: 'English' } }, default: 'fr' }),
  collections: {
    blog: defineCollection({
      entry: 'blogPost', base: 'blog',
      grammar: [segment('category'), segment('subcategory'), locale({ optional: true }), slug()],
      messages: { category: ['title'], subcategory: ['title'] },
    }),
  },
  messages: { directory: 'messages', runtime: 'use-intl' },
  source: createContentCollectionsSource({
    configPath: join(import.meta.dirname, 'content-collections.ts'),
    projectRoot: import.meta.dirname,
  }),
});
`;

/** A message module: the blog's categories, plus the app's own keys. */
function messages(locale: 'fr' | 'en', categories: Readonly<Record<string, readonly string[]>>): string {
  const type = locale === 'fr' ? 'ReferenceMessages' : 'Messages';
  const blog = Object.fromEntries(
    Object.entries(categories).map(([category, subcategories]) => [
      category,
      {
        $: { title: `${category} (${locale})` },
        ...Object.fromEntries(subcategories.map((sub) => [sub, { $: { title: `${sub} (${locale})` } }])),
      },
    ]),
  );
  const home = {
    posts:
      locale === 'fr'
        ? '{count, plural, one {# billet} many {# billets} other {# billets}}'
        : '{count, plural, one {# post} other {# posts}}',
  };

  return `import type { ${type} } from '#figatellultimate/messages';\n\nexport default ${JSON.stringify({ content: { blog }, home })} as const satisfies ${type};\n`;
}

const project = new FileSystem(join(PACKAGE, '.tmp', randomUUID()));

async function run(command: 'build' | 'check'): Promise<{ code: number; output: string }> {
  let output = '';
  const stdout = new Writable({
    write(chunk: Buffer, _encoding, done) {
      output += chunk.toString();
      done();
    },
  });
  const code = await main([command, '--config', join(project.basePath, 'figatellultimate.config.ts')], {
    stdout,
    fancy: false,
    cwd: project.basePath,
  });

  return { code, output };
}

/** Typechecks the message modules and an app against the generated modules, on disk. */
function typecheck(): string[] {
  const tsProject = new Project({
    compilerOptions: {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      allowImportingTsExtensions: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      // The workspace's packages, from their sources (no build needed).
      customConditions: ['@figatellultimate/source'],
    },
  });

  tsProject.addSourceFilesAtPaths(join(project.basePath, '.figatellultimate', '**', '*.ts'));
  tsProject.addSourceFilesAtPaths(join(project.basePath, 'messages', '*.ts'));
  tsProject.createSourceFile(
    join(project.basePath, 'app.ts'),
    `import { createTranslator } from '@figatellultimate/use-intl';
import { loadMessages, type MessageKey } from '#figatellultimate/messages';

const key: MessageKey = 'content.blog.patch-notes.bot.$.title';
export async function render(): Promise<string> {
  const messages = await loadMessages('en');
  const t = createTranslator({ locale: 'en', messages });
  const blog = createTranslator({ locale: 'en', messages, namespace: 'content.blog.patch-notes' });
  // @ts-expect-error count is required
  t('home.posts');
  // @ts-expect-error outside the scope
  blog('home.posts');
  return [key, t('content.blog.patch-notes.bot.$.title'), t('home.posts', { count: 2 }), blog('bot.$.title')].join(' | ');
}
`,
    { overwrite: true },
  );

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
  await project.create('content/blog/patch-notes/bot/post.mdx', '---\ntitle: Bot\n---\nBot.\n');
  await project.create('content-collections.ts', CONTENT_COLLECTIONS_CONFIG);
  await project.create('figatellultimate.config.ts', FIGATELLULTIMATE_CONFIG);
  await project.create('messages/fr.ts', messages('fr', { 'patch-notes': ['bot'] }));
  await project.create('messages/en.ts', messages('en', { 'patch-notes': ['bot'] }));
});
afterAll(() => project.cleanup());

describe('content-derived messages, end to end', () => {
  it('builds complete messages, and the app and every locale typecheck', async () => {
    const { code, output } = await run('build');

    expect(output).not.toContain('missing-message');
    expect(code).toBe(EXIT.ok);
    expect(await project.exists('.figatellultimate/messages/index.js')).toBe(true);
    expect(typecheck()).toEqual([]);
  }, 60_000);

  it('adding a folder makes check report it in every locale, and the typecheck fail once rebuilt', async () => {
    await project.create('content/blog/tutorials/getting-started/first.mdx', '---\ntitle: First\n---\nFirst.\n');
    const checked = await run('check');

    expect(checked.code).toBe(EXIT.content);
    expect(checked.output).toContain('messages/fr.ts');
    expect(checked.output).toContain('messages/en.ts');
    expect(checked.output).toContain('"content.blog.tutorials" is missing');

    // The build keeps the last valid state; the types still describe the previous content.
    expect((await run('build')).code).toBe(EXIT.content);
    expect(typecheck()).toEqual([]);
  }, 60_000);

  it('translating it in every locale makes the build and the typecheck pass again', async () => {
    const categories = { 'patch-notes': ['bot'], tutorials: ['getting-started'] };

    await project.create('messages/fr.ts', messages('fr', categories));
    await project.create('messages/en.ts', messages('en', categories));
    const { code } = await run('build');

    expect(code).toBe(EXIT.ok);
    expect(await project.contents('.figatellultimate/messages/types.d.ts')).toContain('"tutorials"');
    expect(typecheck()).toEqual([]);
  }, 60_000);

  it('a translation missing in one locale fails the typecheck of that locale only', async () => {
    // English forgets the new category: check reports it, and the English module no longer satisfies Messages.
    await project.create('messages/en.ts', messages('en', { 'patch-notes': ['bot'] }));
    const checked = await run('check');

    expect(checked.output).toContain('messages/en.ts');
    expect(checked.output).not.toContain('messages/fr.ts');
    expect(typecheck().join('\n')).toMatch(/en\.ts.*"tutorials"' is missing/);
  }, 60_000);

  it('translates through the use-intl adapter at runtime, with the generated messages', async () => {
    const { createTranslator } = await import('@figatellultimate/use-intl');
    const module: unknown = await import(join(project.basePath, 'messages', 'fr.ts'));
    // Untyped here (this test is not part of the project whose types register the messages): checked instead.
    const messages = isRecord(module) ? module['default'] : undefined;

    if (!isMessages(messages)) throw new Error('messages/fr.ts must export nested texts by default');

    const t = createTranslator({ locale: 'fr', messages, namespace: 'content.blog' });

    expect(t('patch-notes.bot.$.title')).toBe('bot (fr)');
  });

  it('the generated modules run with plain Node: getters, the messages loader, and use-intl', async () => {
    // A plain JavaScript script, run by Node itself: no bundler, no loader hook; Node strips the types of the messages
    // modules the generated loader imports.
    await project.create(
      'run.js',
      `import { createTranslator } from 'use-intl/core';
import { getBlogPost } from '#figatellultimate/blog';
import { loadMessages } from '#figatellultimate/messages';
import { localeInfo } from '#figatellultimate/locales';

const post = await getBlogPost({ locale: 'fr', category: 'patch-notes', subcategory: 'bot', slug: 'post' });
const messages = await loadMessages('en');
const t = createTranslator({ locale: 'en', messages });
console.log(JSON.stringify({ url: post.url, title: post.data.title, label: localeInfo.fr.label, posts: t('home.posts', { count: 2 }) }));
`,
    );
    const { stdout } = await promisify(execFile)(process.execPath, [join(project.basePath, 'run.js')], {
      cwd: project.basePath,
    });

    expect(JSON.parse(stdout)).toEqual({
      url: '/blog/patch-notes/bot/post',
      title: 'Bot',
      label: 'Français',
      posts: '2 posts',
    });
  }, 60_000);
});
