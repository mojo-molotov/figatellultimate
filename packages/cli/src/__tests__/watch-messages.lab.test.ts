// Watch lab, messages: after each change of content or translations, the watched output equals a
// build from scratch. Each scenario ends in a valid state: invalid ones keep the last valid output, by design.
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';

import { createLab, sleep, WITH_FIGATELLU, type Scenario } from './lab-harness.js';

const post = (title: string): string => `---\ntitle: ${title}\n---\n\n# ${title}\n`;

const CONTENT_COLLECTIONS_CONFIG = `
import { defineCollection, defineConfig } from '@content-collections/core';
import * as v from 'valibot';
import { withFigatellu } from ${JSON.stringify(WITH_FIGATELLU)};

const blog = withFigatellu(defineCollection({
  name: 'blog', directory: 'content/blog', include: '**/*.mdx',
  schema: v.object({ title: v.string(), content: v.string() }),
}));
export default defineConfig({ content: [blog] });
`;

const FIGATELLU_CONFIG = `
import { join } from 'node:path';
import { defineCollection, defineConfig, defineLocales, locale, segment, slug } from '@figatellu/core';
import { createContentCollectionsSource } from '@figatellu/content-collections';

export default defineConfig({
  locales: defineLocales({ list: ['fr', 'en'], default: 'fr' }),
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

type Categories = Readonly<Record<string, readonly string[]>>;

/** A complete message module for these categories, plus the app's own keys. */
function messages(locale: 'fr' | 'en', categories: Categories, app: Readonly<Record<string, string>>): string {
  const blog = Object.fromEntries(
    Object.entries(categories).map(([category, subs]) => [
      category,
      {
        $: { title: `${category} (${locale})` },
        ...Object.fromEntries(subs.map((sub) => [sub, { $: { title: `${sub} (${locale})` } }])),
      },
    ]),
  );

  return `export default ${JSON.stringify({ content: { blog }, home: app })};\n`;
}

const INITIAL: Categories = { 'patch-notes': ['bot'] };
const APP = { title: 'Home' };

const lab = createLab({
  'content/blog/patch-notes/bot/post.mdx': post('Bot'),
  'content-collections.ts': CONTENT_COLLECTIONS_CONFIG,
  'figatellu.config.ts': FIGATELLU_CONFIG,
  'messages/fr.ts': messages('fr', INITIAL, APP),
  'messages/en.ts': messages('en', INITIAL, APP),
});
const at = (path: string): string => lab.at(path);
const write = (locale: 'fr' | 'en', categories: Categories, app: Readonly<Record<string, string>>): Promise<void> =>
  writeFile(at(`messages/${locale}.ts`), messages(locale, categories, app));

const SCENARIOS: readonly Scenario[] = [
  [
    'add a key with ICU arguments to the reference and every locale: the types follow',
    async () => {
      const app = { ...APP, posts: '{count, plural, one {# post} other {# posts}}' };

      await write('fr', INITIAL, app);
      await write('en', INITIAL, app);
    },
  ],
  [
    'a new folder, then its translations in every locale',
    async () => {
      await mkdir(at('content/blog/tutorials/getting-started'), { recursive: true });
      await writeFile(at('content/blog/tutorials/getting-started/first.mdx'), post('First'));
      await sleep(1_000);
      const categories = { ...INITIAL, tutorials: ['getting-started'] };
      const app = { ...APP, posts: '{count, plural, one {# post} other {# posts}}' };

      await write('fr', categories, app);
      await write('en', categories, app);
    },
  ],
  [
    'rename a category and its translations together',
    async () => {
      await rename(at('content/blog/tutorials'), at('content/blog/guides'));
      const categories = { ...INITIAL, guides: ['getting-started'] };
      const app = { ...APP, posts: '{count, plural, one {# post} other {# posts}}' };

      await write('fr', categories, app);
      await write('en', categories, app);
    },
  ],
  [
    'remove a locale module, then restore it',
    async () => {
      const en = await readFile(at('messages/en.ts'), 'utf8');

      await rm(at('messages/en.ts'));
      await sleep(1_000);
      await writeFile(at('messages/en.ts'), en);
    },
  ],
];

lab.run('figatellu watch lab, messages: the watched output always equals a build from scratch', SCENARIOS);
