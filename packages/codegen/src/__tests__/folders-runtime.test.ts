// The generated folder pages, run: written to a disposable folder and imported as an app would.
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { FileSystem } from '@japa/file-system';
import {
  analyze,
  assemble,
  defineCollection,
  defineConfig,
  defineLocales,
  locale,
  segment,
  slug,
  type ContentSource,
} from '@figatellultimate/core';
import * as v from 'valibot';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { emit } from '../index.js';

const source: ContentSource = {
  directories: () => Promise.resolve({ blog: 'content/blog' }),
  async *documents() {
    yield* [];
    await Promise.resolve();
  },
};

const config = defineConfig({
  locales: defineLocales({ list: ['fr', 'en'], default: 'fr' }),
  collections: {
    blog: defineCollection({
      entry: 'blogPost',
      base: 'blog',
      grammar: [segment('category'), segment('subcategory'), locale({ optional: true }), slug()],
      metadata: { title: 'title', publishedTime: 'date', image: 'cover' },
      messages: { $root: ['description'], category: ['title', 'description'], subcategory: ['title', 'description'] },
      folderPages: {
        root: true,
        // Each folder page's meta description, read from its messages.
        metadata: { description: 'description' },
        levels: ['category', 'subcategory'],
        images: { news: '/covers/news.jpeg' },
        // One entry a page in a subcategory: bot has two in French, one in English.
        perPage: { subcategory: 1 },
        // Its listings' indexes, at `/listing/<segments>`.
        index: 'listing',
      },
    }),
  },
  source,
});

const DATES: Readonly<Record<string, string>> = {
  'news/bot/a.mdx': '2026-01-01',
  'news/bot/b.mdx': '2026-03-01',
  'news/bot/en/a.mdx': '2026-01-01',
};

// The generated module is checked against what the tests read, not cast.
const Item = v.looseObject({ url: v.string() });
const Found = v.optional(
  v.looseObject({
    kind: v.string(),
    collection: v.string(),
    folder: v.optional(
      v.looseObject({
        index: v.optional(v.string()),
        level: v.nullable(v.string()),
        label: v.nullable(v.string()),
        entries: v.array(Item),
        subfolders: v.array(
          v.looseObject({
            url: v.optional(v.string()),
            messages: v.record(v.string(), v.string()),
            image: v.optional(v.string()),
            total: v.number(),
            latest: v.array(Item),
          }),
        ),
        image: v.optional(v.string()),
        messages: v.record(v.string(), v.string()),
        metadata: v.object({ description: v.optional(v.string()) }),
        alternates: v.unknown(),
        url: v.string(),
        page: v.number(),
        pages: v.number(),
        first: v.string(),
        perPage: v.optional(v.number()),
      }),
    ),
    entry: v.optional(Item),
  }),
);
const UrlsModule = v.looseObject({
  findByUrl: v.function(),
  mountedUrls: v.array(
    v.looseObject({ kind: v.string(), url: v.string(), locale: v.string(), alternates: v.unknown(), key: v.string() }),
  ),
});

const folder = new FileSystem(join(import.meta.dirname, '..', '..', '.tmp', randomUUID()));
let urls: {
  readonly findByUrl: (url: string) => Promise<v.InferOutput<typeof Found>>;
  readonly mountedUrls: v.InferOutput<typeof UrlsModule>['mountedUrls'];
};
let listingIndexes: () => readonly { readonly url: string; readonly index: string }[];

beforeAll(async () => {
  const sources = Object.keys(DATES).map((sourcePath) => ({ collection: 'blog', sourcePath }));
  const assembly = assemble({
    analysis: analyze({ locales: config.locales, collections: config.collections, sources }),
    documents: sources.map((s) => ({
      ...s,
      data: {
        title: s.sourcePath,
        date: DATES[s.sourcePath],
        cover: `/covers/${s.sourcePath.replaceAll('/', '-')}.jpeg`,
      },
      body: '',
    })),
    sourceDiagnostics: [],
    collections: config.collections,
    taxonomies: {},
    environment: { drafts: 'include', testContent: 'include' },
  });

  expect(assembly.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

  for (const file of emit({ config, assembly, outputDirectory: folder.basePath }))
    await folder.create(file.path, file.contents);

  const module = v.parse(UrlsModule, await import(pathToFileURL(join(folder.basePath, 'urls', 'index.js')).href));

  urls = {
    mountedUrls: module.mountedUrls,
    findByUrl: async (url) => v.parse(Found, await module.findByUrl(url)),
  };
  const blog = v.parse(
    v.looseObject({ blogListingIndexes: v.function() }),
    await import(pathToFileURL(join(folder.basePath, 'blog', 'index.js')).href),
  );

  listingIndexes = () =>
    v.parse(v.array(v.looseObject({ url: v.string(), index: v.string() })), blog.blogListingIndexes());
});
afterAll(() => folder.cleanup());

describe('generated folder pages, run', () => {
  it('mounts the folder pages beside the entries, each with its translations and key', () => {
    const folders = urls.mountedUrls.filter((item) => item.kind === 'folder');

    expect(folders.map((item) => item.url).sort()).toEqual([
      '/blog',
      '/blog/news',
      '/blog/news/bot',
      '/blog/news/bot/page/2',
      '/en/blog',
      '/en/blog/news',
      '/en/blog/news/bot',
    ]);
    expect(folders.find((item) => item.url === '/blog/news/bot')).toMatchObject({
      locale: 'fr',
      alternates: { fr: '/blog/news/bot', en: '/en/blog/news/bot' },
      key: 'news/bot',
    });
    expect(urls.mountedUrls.filter((item) => item.kind === 'entry')).toHaveLength(3);
    // The blog's own page has an empty key, as a home: never marked one, its route being `/blog`.
    expect(urls.mountedUrls.some((item) => 'home' in item)).toBe(false);
  });

  it('findByUrl finds a folder page, its previews and entries resolved to index items, newest first', async () => {
    const root = await urls.findByUrl('/blog');

    expect(root).toMatchObject({ kind: 'folder', collection: 'blog', folder: { level: null, label: null } });
    expect(root?.folder?.subfolders.map((s) => [s.url, s.total, s.latest.map((i) => i.url)])).toEqual([
      ['/blog/news', 2, ['/blog/news/bot/b', '/blog/news/bot/a']],
    ]);
    const bot = await urls.findByUrl('/blog/news/bot');

    expect(bot?.folder?.entries.map((i) => i.url)).toEqual(['/blog/news/bot/b', '/blog/news/bot/a']);
    expect(bot?.folder?.label).toBe('content.blog.news.bot.$.title');
  });

  it('gives every page of a paginated listing its index, and lists those listings once, for their route', async () => {
    const indexes = await Promise.all(
      ['/blog/news/bot', '/blog/news/bot/page/2', '/en/blog/news/bot', '/blog/news'].map(
        async (url) => (await urls.findByUrl(url))?.folder?.index,
      ),
    );

    // Its every page shares it, in its locale; a level listing subfolders has none.
    expect(indexes).toEqual(['/listing/news/bot', '/listing/news/bot', '/en/listing/news/bot', undefined]);
    expect(listingIndexes().map((folder) => [folder.url, folder.index])).toEqual([
      ['/blog/news/bot', '/listing/news/bot'],
      ['/en/blog/news/bot', '/en/listing/news/bot'],
    ]);
  });

  it('gives a folder its image: declared for its path, else its newest entry’s', async () => {
    const root = await urls.findByUrl('/blog');

    // `news` is declared; the root, not declared, takes its newest entry's.
    expect(root?.folder?.subfolders.map((s) => s.image)).toEqual(['/covers/news.jpeg']);
    expect(root?.folder?.image).toBe('/covers/news-bot-b.mdx.jpeg');
    const bot = await urls.findByUrl('/blog/news/bot');

    // Not declared: its newest entry (b, March) in its locale.
    expect(bot?.folder?.image).toBe('/covers/news-bot-b.mdx.jpeg');
    const english = await urls.findByUrl('/en/blog/news/bot');

    expect(english?.folder?.image).toBe('/covers/news-bot-en-a.mdx.jpeg');
  });

  it('gives a folder the message keys of the fields its level declares', async () => {
    const root = await urls.findByUrl('/blog');

    // The collection's own page: its own fields (`messages.$root`), under the collection's `$`.
    expect(root?.folder?.messages).toEqual({ description: 'content.blog.$.description' });
    expect(root?.folder?.subfolders.map((s) => s.messages)).toEqual([
      { title: 'content.blog.news.$.title', description: 'content.blog.news.$.description' },
    ]);
    const bot = await urls.findByUrl('/blog/news/bot');

    expect(bot?.folder?.messages).toEqual({
      title: 'content.blog.news.bot.$.title',
      description: 'content.blog.news.bot.$.description',
    });
  });

  it("gives every folder page its description's message key, for its SEO, the collection's own page too", async () => {
    expect((await urls.findByUrl('/blog/news'))?.folder?.metadata).toEqual({
      description: 'content.blog.news.$.description',
    });
    expect((await urls.findByUrl('/en/blog/news/bot'))?.folder?.metadata).toEqual({
      description: 'content.blog.news.bot.$.description',
    });
    expect((await urls.findByUrl('/blog'))?.folder?.metadata).toEqual({ description: 'content.blog.$.description' });
  });

  it('mounts a folder page per slice: its own URL, translations and key, the folder found with its page', async () => {
    expect(urls.mountedUrls.find((item) => item.url === '/blog/news/bot/page/2')).toMatchObject({
      kind: 'folder',
      locale: 'fr',
      // English has one page: page 2 has no translation.
      alternates: { fr: '/blog/news/bot/page/2' },
      key: 'news/bot/page/2',
    });
    const second = await urls.findByUrl('/blog/news/bot/page/2');

    expect(second?.folder).toMatchObject({
      url: '/blog/news/bot/page/2',
      page: 2,
      pages: 2,
      first: '/blog/news/bot',
      perPage: 1,
      alternates: { fr: '/blog/news/bot/page/2' },
    });
    // Every entry, newest first: the app shows the page's slice.
    expect(second?.folder?.entries.map((i) => i.url)).toEqual(['/blog/news/bot/b', '/blog/news/bot/a']);
    expect(await urls.findByUrl('/blog/news/bot')).toMatchObject({
      folder: { url: '/blog/news/bot', page: 1, pages: 2, first: '/blog/news/bot', perPage: 1 },
    });
    // A level without a page size: one page.
    expect((await urls.findByUrl('/blog/news'))?.folder).toMatchObject({ page: 1, pages: 1, first: '/blog/news' });
    expect((await urls.findByUrl('/blog/news'))?.folder?.perPage).toBeUndefined();
  });

  it('still finds entries, now marked as such', async () => {
    expect(await urls.findByUrl('/blog/news/bot/a')).toMatchObject({ kind: 'entry', collection: 'blog' });
    expect(await urls.findByUrl('/blog/nope')).toBeUndefined();
  });
});
