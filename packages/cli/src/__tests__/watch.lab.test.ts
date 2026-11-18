// Watch lab: after each burst of file system changes, what `figatellu watch` wrote must be byte-identical to
// a build from scratch. Timing-dependent and slow: run by `pnpm test:lab` and a scheduled CI job, not on every PR.
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createLab, sleep, WITH_FIGATELLU, type Scenario } from './lab-harness.js';

const post = (title: string): string => `---\ntitle: ${title}\ntags: [guide]\n---\n\n# ${title}\n`;
const page = (title: string): string => `---\ntitle: ${title}\n---\n\n# ${title}\n`;

const CONTENT: Readonly<Record<string, string>> = {
  'content/blog/patch-notes/dashboard/post-01.mdx': post('Notes 1'),
  'content/blog/patch-notes/dashboard/en/post-01.mdx': post('Patch notes 1'),
  'content/blog/patch-notes/bot/post-02.mdx': post('Bot'),
  'content/blog/tutorials/getting-started/first-steps.mdx': post('Premiers pas'),
  'content/blog/tutorials/getting-started/en/first-steps.mdx': post('First steps'),
  'content/pages/index.mdx': page('Accueil'),
  'content/pages/en/index.mdx': page('Home'),
  'content/pages/docs/setup.mdx': page('Installation'),
  'content/pages/en/docs/setup.mdx': page('Setup'),
};

const CONTENT_COLLECTIONS_CONFIG = `
import { defineCollection, defineConfig } from '@content-collections/core';
import * as v from 'valibot';
import { withFigatellu } from ${JSON.stringify(WITH_FIGATELLU)};

const blog = withFigatellu(defineCollection({
  name: 'blog', directory: 'content/blog', include: '**/*.mdx',
  schema: v.object({ title: v.string(), tags: v.array(v.string()), content: v.string() }),
}));
const pages = withFigatellu(defineCollection({
  name: 'pages', directory: 'content/pages', include: '**/*.mdx',
  schema: v.object({ title: v.string(), content: v.string() }),
}));
export default defineConfig({ content: [blog, pages] });
`;

const FIGATELLU_CONFIG = `
import { join } from 'node:path';
import { defineCollection, defineConfig, defineLocales, defineTaxonomy, locale, rest, segment, slug } from '@figatellu/core';
import { createContentCollectionsSource } from '@figatellu/content-collections';

export default defineConfig({
  locales: defineLocales({ list: ['fr', 'en'], default: 'fr' }),
  collections: {
    blog: defineCollection({
      entry: 'blogPost', base: 'blog',
      grammar: [segment('category'), segment('subcategory'), locale({ optional: true }), slug()],
      indexForbiddenUnder: ['category', 'subcategory'],
      references: { tags: 'tags' },
    }),
    pages: defineCollection({ entry: 'page', base: '', grammar: [locale({ optional: true }), rest('path'), slug()] }),
  },
  taxonomies: { tags: defineTaxonomy(['guide']) },
  source: createContentCollectionsSource({
    configPath: join(import.meta.dirname, 'content-collections.ts'),
    projectRoot: import.meta.dirname,
  }),
});
`;

const lab = createLab({
  ...CONTENT,
  'content-collections.ts': CONTENT_COLLECTIONS_CONFIG,
  'figatellu.config.ts': FIGATELLU_CONFIG,
});
const at = (path: string): string => lab.at(path);
const blog = (path: string): string => at(`content/blog/${path}`);
const pages = (path: string): string => at(`content/pages/${path}`);

/** Scenarios run in order, each on the state the previous one left. */
const SCENARIOS: readonly Scenario[] = [
  ['rename a category folder', () => rename(blog('tutorials'), blog('guides'))],
  ['move a subcategory into another category', () => rename(blog('patch-notes/bot'), blog('guides/bot'))],
  [
    'move a locale folder below a path segment, then back',
    async () => {
      await rename(pages('en'), pages('docs/en'));
      await sleep(500);
      await rename(pages('docs/en'), pages('en'));
    },
  ],
  [
    'create 40 posts at once in new nested folders (above the rescan threshold)',
    async () => {
      for (let i = 0; i < 40; i++) {
        const folder = blog(`bulk/sub-${String(i % 4)}`);

        await mkdir(folder, { recursive: true });
        await writeFile(join(folder, `post-${String(i)}.mdx`), post(`Bulk ${String(i)}`));
      }
    },
  ],
  [
    'edit files inside the freshly created folders',
    async () => {
      for (const i of [0, 5, 13, 39]) {
        await writeFile(blog(`bulk/sub-${String(i % 4)}/post-${String(i)}.mdx`), post(`Edited ${String(i)}`));
      }
    },
  ],
  [
    'create a few posts in a new folder (file by file), then edit one',
    async () => {
      await mkdir(blog('guides/fresh'), { recursive: true });

      for (let i = 0; i < 5; i++) await writeFile(blog(`guides/fresh/p-${String(i)}.mdx`), post(`Fresh ${String(i)}`));

      await sleep(500);
      await writeFile(blog('guides/fresh/p-3.mdx'), post('Fresh edited'));
    },
  ],
  ['delete a whole category at once', () => rm(blog('bulk'), { recursive: true })],
  [
    'swap two folders through a temporary name',
    async () => {
      await rename(blog('guides/bot'), blog('guides/tmp'));
      await rename(blog('guides/getting-started'), blog('guides/bot'));
      await rename(blog('guides/tmp'), blog('guides/getting-started'));
    },
  ],
  [
    'move a folder to a wrong depth (content error), then fix it',
    async () => {
      await rename(blog('guides/bot'), blog('guides/getting-started/bot'));
      await sleep(300);
      await rename(blog('guides/getting-started/bot'), blog('guides/bot'));
    },
  ],
  [
    'create, edit, rename and delete the same file in a row',
    async () => {
      await writeFile(blog('guides/bot/flash.mdx'), post('Flash 1'));
      await writeFile(blog('guides/bot/flash.mdx'), post('Flash 2'));
      await rename(blog('guides/bot/flash.mdx'), blog('guides/bot/flash-2.mdx'));
      await writeFile(blog('guides/bot/keep.mdx'), post('Keep'));
      await rm(blog('guides/bot/flash-2.mdx'));
    },
  ],
  [
    'move a subtree out of the content folder, then back',
    async () => {
      await rename(blog('guides'), at('guides-away'));
      await sleep(1_500);
      await rename(at('guides-away'), blog('guides'));
    },
  ],
];

lab.run('figatellu watch lab: the watched output always equals a build from scratch', SCENARIOS);
