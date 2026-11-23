import { describe, expect, it } from 'vitest';

import { blog, locales, pages } from '../../__tests__/scenarios/collections.js';
import { defineCollection } from '../../declarations/collection.js';
import { analyze, type SourceInput } from '../analyze.js';
import { folderPagesOf } from '../folders.js';

const blogWithPages = defineCollection({ ...blog, folderPages: { root: true, levels: ['category', 'subcategory'] } });
const collections = { pages, blog: blogWithPages };

const src = (collection: string, ...paths: string[]): SourceInput[] =>
  paths.map((sourcePath) => ({ collection, sourcePath }));

/** Two categories; `bot` in French and English, `site` in French only. */
const SOURCES = [
  ...src('blog', 'news/bot/post-01.mdx', 'news/bot/en/post-01.mdx', 'news/bot/post-02.mdx', 'news/site/post-03.mdx'),
  ...src('blog', 'guides/start/post-04.mdx'),
  ...src('pages', 'index.mdx', 'en/index.mdx'),
];

const folders = () => {
  const analysis = analyze({ locales, collections, sources: SOURCES });

  // Precondition: the scenario is valid.
  expect(analysis.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

  return folderPagesOf({ locales, collections, entries: analysis.entries });
};

describe('folderPagesOf', () => {
  it('mounts the root and every folder of the declared levels, in each locale where it holds an entry', () => {
    expect(folders().map((f) => `${f.locale} ${f.level ?? 'root'} ${f.url}`)).toEqual(
      [
        'fr root /blog',
        'fr category /blog/guides',
        'fr subcategory /blog/guides/start',
        'fr category /blog/news',
        'fr subcategory /blog/news/bot',
        'fr subcategory /blog/news/site',
        'en root /en/blog',
        'en category /en/blog/news',
        'en subcategory /en/blog/news/bot',
      ].sort((a, b) => (a.split(' ')[2] ?? '').localeCompare(b.split(' ')[2] ?? '')),
    );
  });

  it('gives each folder its segments and route, each URL once', () => {
    const bot = folders().find((f) => f.url === '/blog/news/bot');

    expect(bot).toEqual({
      collection: 'blog',
      locale: 'fr',
      level: 'subcategory',
      segments: { category: 'news', subcategory: 'bot' },
      route: '/blog/news/bot',
      url: '/blog/news/bot',
      page: 1,
      pages: 1,
      first: '/blog/news/bot',
    });
    const urls = folders().map((f) => f.url);

    expect(new Set(urls).size).toBe(urls.length);
  });

  it('a folder holding only reserved entries has no page', () => {
    const reservedBlog = defineCollection({ ...blogWithPages, reserved: ['guides/*'] });
    const analysis = analyze({ locales, collections: { pages, blog: reservedBlog }, sources: SOURCES });
    const urls = folderPagesOf({ locales, collections: { pages, blog: reservedBlog }, entries: analysis.entries }).map(
      (f) => f.url,
    );

    expect(urls).not.toContain('/blog/guides');
    expect(urls).toContain('/blog/news');
  });

  it('has nothing for a collection without folderPages', () => {
    const analysis = analyze({ locales, collections: { pages, blog }, sources: SOURCES });

    expect(folderPagesOf({ locales, collections: { pages, blog }, entries: analysis.entries })).toEqual([]);
  });
});

describe('folder-page-collision', () => {
  it('an entry at a folder page’s URL is an error, naming its file and the level', () => {
    const blogWithIndex = defineCollection({ ...blogWithPages, indexForbiddenUnder: [] });
    const analysis = analyze({
      locales,
      collections: { pages, blog: blogWithIndex },
      sources: [...SOURCES, ...src('blog', 'news/bot/index.mdx')],
    });

    expect(analysis.diagnostics.filter((d) => d.code === 'folder-page-collision')).toEqual([
      expect.objectContaining({
        collection: 'blog',
        sourcePath: 'news/bot/index.mdx',
        data: { url: '/blog/news/bot', level: 'subcategory' },
      }),
    ]);
    // The colliding entry is left out; the others stay.
    expect(analysis.entries.some((e) => e.sourcePath === 'news/bot/index.mdx')).toBe(false);
    expect(analysis.entries.some((e) => e.sourcePath === 'news/bot/post-01.mdx')).toBe(true);
  });
});

describe('folder-image-fallback', () => {
  /** The folders reported as taking their image from their entries, and how. */
  const fallbacks = (
    folderPages: {
      readonly root: boolean;
      readonly levels: readonly ('category' | 'subcategory')[];
      readonly images: Readonly<Record<string, string>>;
    },
    image?: string,
  ) => {
    const declared = defineCollection({ ...blog, metadata: image === undefined ? {} : { image }, folderPages });
    const analysis = analyze({ locales, collections: { pages, blog: declared }, sources: SOURCES });

    return analysis.diagnostics
      .filter((d) => d.code === 'folder-image-fallback')
      .map((d) => [d.severity, d.data.path, d.data.fallback]);
  };

  it.each([
    [
      'every shown folder without a declared image, the root aside',
      { root: true, levels: ['category', 'subcategory'], images: { news: '/n.jpeg', 'news/bot': '/b.jpeg' } },
      ['guides', 'guides/start', 'news/site'],
    ],
    [
      'a subcategory previewed on its category’s page, though it has no page of its own',
      { root: false, levels: ['category'], images: { guides: '/g.jpeg', news: '/n.jpeg' } },
      ['guides/start', 'news/bot', 'news/site'],
    ],
    [
      'no category when nothing shows it: no page of its own, no page of the collection',
      { root: false, levels: ['subcategory'], images: { 'news/bot': '/b.jpeg' } },
      ['guides/start', 'news/site'],
    ],
  ] as const)('informs about %s', (_, folderPages, expected) => {
    expect(fallbacks(folderPages, 'cover')).toEqual(expected.map((path) => ['info', path, 'newest-entry']));
  });

  it('says a folder shows no image when the entries have no image field', () => {
    expect(fallbacks({ root: true, levels: ['category'], images: { news: '/n.jpeg' } })).toEqual(
      ['guides', 'guides/start', 'news/bot', 'news/site'].map((path) => ['info', path, 'none']),
    );
  });
});

describe('unused-folder-image', () => {
  it('warns about an image declared for a folder the content does not have, suggesting the closest', () => {
    const withImages = defineCollection({
      ...blogWithPages,
      folderPages: {
        root: true,
        levels: ['category', 'subcategory'],
        images: { news: '/covers/news.jpeg', 'news/bot': '/covers/bot.jpeg', 'new/bots': '/covers/typo.jpeg' },
      },
    });
    const analysis = analyze({ locales, collections: { pages, blog: withImages }, sources: SOURCES });

    expect(analysis.diagnostics.filter((d) => d.code === 'unused-folder-image')).toEqual([
      expect.objectContaining({
        severity: 'warning',
        collection: 'blog',
        sourcePath: null,
        data: { path: 'new/bots' },
        suggestions: ['news/bot'],
      }),
    ]);
  });

  it('paginates a folder by its page size: its first page at its own URL, the others at /page/N', () => {
    // One item a page: entries in a subcategory, subcategories in a category, categories at the root.
    const paged = defineCollection({
      ...blog,
      folderPages: {
        root: true,
        levels: ['category', 'subcategory'],
        perPage: { root: 1, category: 1, subcategory: 1 },
      },
    });
    const analysis = analyze({ locales, collections: { pages, blog: paged }, sources: SOURCES });
    const all = folderPagesOf({ locales, collections: { pages, blog: paged }, entries: analysis.entries });
    const of = (first: string) =>
      all.filter((f) => f.first === first).map((f) => `${String(f.page)}/${String(f.pages)} ${f.url}`);

    // Precondition: the scenario is valid.
    expect(analysis.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    // bot: two entries in French, one in English.
    expect(of('/blog/news/bot')).toEqual(['1/2 /blog/news/bot', '2/2 /blog/news/bot/page/2']);
    expect(of('/en/blog/news/bot')).toEqual(['1/1 /en/blog/news/bot']);
    // news: two subcategories (bot, site); the root: two categories (guides, news).
    expect(of('/blog/news')).toEqual(['1/2 /blog/news', '2/2 /blog/news/page/2']);
    expect(of('/blog')).toEqual(['1/2 /blog', '2/2 /blog/page/2']);
    expect(all.find((f) => f.url === '/blog/news/bot/page/2')).toMatchObject({
      level: 'subcategory',
      segments: { category: 'news', subcategory: 'bot' },
      route: '/blog/news/bot/page/2',
    });
  });

  it('an entry at a folder page of a slice is a collision, as at its first page', () => {
    const paged = defineCollection({
      ...blog,
      folderPages: { levels: ['category', 'subcategory'], perPage: { category: 1 } },
    });
    // news holds two subcategories, so its second page is /blog/news/page/2: an entry `news/page/2` takes that URL.
    const analysis = analyze({
      locales,
      collections: { pages, blog: paged },
      sources: [...SOURCES, ...src('blog', 'news/page/2.mdx')],
    });

    expect(analysis.diagnostics.map((d) => [d.code, d.sourcePath])).toContainEqual([
      'folder-page-collision',
      'news/page/2.mdx',
    ]);
  });
});
