// Unused messages acceptance: the app's keys no typed call reaches are warned by build and check, never one a call
// reaches through a template, a scope or a typed variable, nor one kept by a marker in the schema.
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Writable } from 'node:stream';

import { FileSystem } from '@japa/file-system';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EXIT, main } from '../main.js';

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
import { defineCollection, defineConfig, defineLocales, segment, slug } from '@figatellultimate/core';
import { createContentCollectionsSource } from '@figatellultimate/content-collections';

export default defineConfig({
  locales: defineLocales({ list: ['fr', 'en'], default: 'fr' }),
  collections: {
    blog: defineCollection({
      entry: 'blogPost', base: 'blog', grammar: [segment('category'), slug()], messages: { category: ['title'] },
    }),
  },
  messages: { directory: 'messages', runtime: 'use-intl', schema: 'schema.ts' },
  source: createContentCollectionsSource({
    configPath: join(import.meta.dirname, 'content-collections.ts'),
    projectRoot: import.meta.dirname,
  }),
});
`;

/** The schema: the skeleton, then the app's keys; a group kept by a marker. */
const SCHEMA = `import { skeleton, type MessageSchema, type MessagesOf } from '#figatellultimate/messages';

const _ = '';

export const schema = {
  ...skeleton,
  ui: {
    title: _,
    sort: { asc: _, desc: _ },
    search: { trigger: _, found: _ },
    // figatellultimate-keep: read by the e-mail templates, outside this app
    legacy: { a: _, b: _ },
    picked: _,
    dead: _,
  },
} as const satisfies MessageSchema;

export type AppMessages = MessagesOf<typeof schema>;
`;

/** A locale's module: every key of the schema, \`extra\` keys added. */
const messages = (locale: 'fr' | 'en', extra = ''): string => `import type { AppMessages } from './schema.ts';

export default {
  content: { blog: { news: { $: { title: 'news (${locale})' } } } },
  ui: {
    title: 'title', sort: { asc: 'asc', desc: 'desc' }, search: { trigger: 'trigger', found: 'found' },
    legacy: { a: 'a', b: 'b' }, picked: 'picked', dead: 'dead',${extra}
  },
} as const satisfies AppMessages;
`;

/** The app: every way a key is reached, but \`ui.dead\`; and a value typed as any key, which reaches none. */
const APP = `import { createTranslator } from '@figatellultimate/use-intl';
import { loadMessages, type MessageKey } from '#figatellultimate/messages';

const SORTS = ['asc', 'desc'] as const;

export async function render(): Promise<string[]> {
  const messages = await loadMessages('fr');
  const t = createTranslator({ locale: 'fr', messages });
  const search = createTranslator({ locale: 'fr', messages, namespace: 'ui.search' });
  const pick = (key: 'ui.picked' | 'ui.title'): string => t(key);
  // Typed as any key, as generated data is (a folder's label): it says nothing, its keys count where written.
  const label = (key: MessageKey): string => t(key);

  return [
    t('content.blog.news.$.title'),
    ...SORTS.map((sort) => t(\`ui.sort.\${sort}\`)),
    search('trigger'),
    search('found'),
    pick('ui.title'),
    label('ui.title'),
  ];
}
`;

const TSCONFIG = {
  compilerOptions: {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    allowImportingTsExtensions: true,
    target: 'ESNext',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    // The workspace's packages, from their sources (no build needed).
    customConditions: ['@figatellultimate/source'],
  },
  include: ['**/*.ts'],
};

const project = new FileSystem(join(PACKAGE, '.tmp', randomUUID()));

async function run(command: 'build' | 'check', ...options: string[]): Promise<{ code: number; output: string }> {
  let output = '';
  const stdout = new Writable({
    write(chunk: Buffer, _encoding, done) {
      output += chunk.toString();
      done();
    },
  });
  const code = await main([command, '--config', join(project.basePath, 'figatellultimate.config.ts'), ...options], {
    stdout,
    fancy: false,
    cwd: project.basePath,
  });

  return { code, output };
}

/** The keys reported as unused in an output. */
const unusedIn = (output: string): string[] =>
  [...output.matchAll(/"([^"]+)" is not used by the app/g)].map((m) => m[1] ?? '');

beforeAll(async () => {
  await project.create(
    'package.json',
    JSON.stringify({ type: 'module', imports: { '#figatellultimate/*': './.figatellultimate/*/index.js' } }),
  );
  await project.create('tsconfig.json', JSON.stringify(TSCONFIG));
  await project.create('content/blog/news/first.mdx', '---\ntitle: First\n---\nFirst.\n');
  await project.create('content-collections.ts', CONTENT_COLLECTIONS_CONFIG);
  await project.create('figatellultimate.config.ts', FIGATELLULTIMATE_CONFIG);
  await project.create('messages/schema.ts', SCHEMA);
  await project.create('messages/fr.ts', messages('fr'));
  await project.create('messages/en.ts', messages('en'));
  await project.create('app.ts', APP);
});
afterAll(() => project.cleanup());

describe('unused messages, end to end', () => {
  it('build warns the one message no call reaches, located in the default locale, and still writes', async () => {
    const { code, output } = await run('build');

    expect(code).toBe(EXIT.ok);
    expect(await project.exists('.figatellultimate/messages/index.js')).toBe(true);
    expect(unusedIn(output)).toEqual(['ui.dead']);
    expect(output).toContain('messages/fr.ts');
    expect(output).toContain('figatellultimate-keep');
  });

  it('check, once built, warns the same', async () => {
    const { code, output } = await run('check');

    expect(code).toBe(EXIT.ok);
    expect(unusedIn(output)).toEqual(['ui.dead']);
  });

  it.each(['build', 'check'] as const)('%s --no-unused skips the scan, silently', async (command) => {
    const { code, output } = await run(command, '--no-unused');

    expect(code).toBe(EXIT.ok);
    expect(unusedIn(output)).toEqual([]);
    expect(output).not.toContain('Unused messages not checked');
  });

  it('a call reaching the message silences it', async () => {
    await project.create('app.ts', APP.replace("pick('ui.title'),", "pick('ui.title'),\n    t('ui.dead'),"));

    expect(unusedIn((await run('check')).output)).toEqual([]);
  });

  it('check skips, and says so, while .figatellultimate/ is older than the messages: its types would mislead', async () => {
    await project.create('messages/schema.ts', SCHEMA.replace('dead: _,', 'dead: _,\n    fresh: _,'));
    await project.create('messages/fr.ts', messages('fr', " fresh: 'fresh',"));
    await project.create('messages/en.ts', messages('en', " fresh: 'fresh',"));
    const { output } = await run('check');

    expect(unusedIn(output)).toEqual([]);
    expect(output).toContain('Unused messages not checked');
    expect(unusedIn((await run('build')).output)).toEqual(['ui.fresh']);
  });

  it('a marker keeps its message only with a reason', async () => {
    const marked = (marker: string): string => SCHEMA.replace('dead: _,', `dead: _,\n    ${marker}\n    fresh: _,`);

    await project.create('messages/schema.ts', marked('// figatellultimate-keep:'));

    expect(unusedIn((await run('build')).output)).toEqual(['ui.fresh']);

    await project.create('messages/schema.ts', marked('// figatellultimate-keep: shown by the next release'));

    expect(unusedIn((await run('build')).output)).toEqual([]);
  });
});
