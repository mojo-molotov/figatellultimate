import {
  analyze,
  assemble,
  createUrlBuilder,
  defineCollection,
  defineLocales,
  folderPagesOf,
  locale,
  segment,
  slug,
  type Entry,
} from '@figatellultimate/core';
import { describe, expect, it } from 'vitest';

import { folderData } from '../folders.js';

const locales = defineLocales({ list: ['fr', 'en'], default: 'fr' });
const blog = defineCollection({
  entry: 'blogPost',
  base: 'blog',
  grammar: [segment('category'), segment('subcategory'), locale({ optional: true }), slug()],
  metadata: { title: 'title', publishedTime: 'date' },
  folderPages: { root: true, levels: ['category', 'subcategory'], preview: 2 },
});
const collections = { blog };
const urls = createUrlBuilder(locales);

/** Dates out of the key order, so that a no-op sort cannot pass. */
const FILES: Readonly<Record<string, string>> = {
  'news/bot/a.mdx': '2026-01-01',
  'news/bot/b.mdx': '2026-03-01',
  'news/bot/c.mdx': '2026-02-01',
  'news/bot/en/a.mdx': '2026-01-01',
  'news/site/d.mdx': '2026-04-01',
  'guides/start/e.mdx': '2026-05-01',
};

function build() {
  const sources = Object.keys(FILES).map((sourcePath) => ({ collection: 'blog', sourcePath }));
  const analysis = analyze({ locales, collections, sources });
  const assembly = assemble({
    analysis,
    documents: sources.map((s) => ({ ...s, data: { title: s.sourcePath, date: FILES[s.sourcePath] }, body: '' })),
    sourceDiagnostics: [],
    collections,
    taxonomies: {},
    environment: { drafts: 'include', testContent: 'include' },
  });

  expect(assembly.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const folders = folderPagesOf({ locales, collections, urls, entries: assembly.entries.map((e) => e.descriptor) });
  const data = folderData('blog', blog, assembly.entries, folders, (entry: Entry) => urls.url(entry.descriptor));

  return new Map(data.map((folder) => [folder.url, folder]));
}

describe('folderData', () => {
  it('the root lists the categories with their totals and latest posts, newest first', () => {
    const root = build().get('/blog');

    expect(root?.level).toBeNull();
    expect(root?.label).toBeNull();
    expect(root?.subfolders.map((s) => [s.label, s.url, s.total, s.latest])).toEqual([
      ['content.blog.guides.$.title', '/blog/guides', 1, ['/blog/guides/start/e']],
      ['content.blog.news.$.title', '/blog/news', 4, ['/blog/news/site/d', '/blog/news/bot/b']],
    ]);
    expect(root?.entries).toEqual([]);
  });

  it('each subfolder says its level, so that the app tells a folder of folders from a list of entries', () => {
    const folders = build();

    expect(folders.get('/blog')?.subfolders.map((s) => s.level)).toEqual(['category', 'category']);
    expect(folders.get('/blog/news')?.subfolders.map((s) => s.level)).toEqual(['subcategory', 'subcategory']);
  });

  it('a category lists its subcategories; a preview holds at most `preview` posts, by date', () => {
    const news = build().get('/blog/news');

    expect(news?.label).toBe('content.blog.news.$.title');
    expect(news?.subfolders.map((s) => [s.label, s.url, s.total, s.latest])).toEqual([
      ['content.blog.news.bot.$.title', '/blog/news/bot', 3, ['/blog/news/bot/b', '/blog/news/bot/c']],
      ['content.blog.news.site.$.title', '/blog/news/site', 1, ['/blog/news/site/d']],
    ]);
  });

  it('a subcategory, the deepest level, holds its posts directly, newest first', () => {
    const bot = build().get('/blog/news/bot');

    expect(bot?.subfolders).toEqual([]);
    expect(bot?.entries).toEqual(['/blog/news/bot/b', '/blog/news/bot/c', '/blog/news/bot/a']);
    expect(bot?.segments).toEqual({ category: 'news', subcategory: 'bot' });
  });

  it('exists in a locale only where it holds posts; its alternates say where', () => {
    const folders = build();

    expect(folders.get('/blog/news/bot')?.alternates).toEqual({ fr: '/blog/news/bot', en: '/en/blog/news/bot' });
    expect(folders.has('/en/blog/news/site')).toBe(false);
    expect(folders.get('/en/blog')?.subfolders.map((s) => s.label)).toEqual(['content.blog.news.$.title']);
  });
});
