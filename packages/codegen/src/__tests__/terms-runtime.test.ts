// The generated term pages, run: written to a disposable folder and imported as an app would.
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
  defineTaxonomy,
  locale,
  rest,
  segment,
  slug,
  type ContentSource,
} from '@figatellultimate/core';
import * as v from 'valibot';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { emit } from '../index.js';

const source: ContentSource = {
  directories: () => Promise.resolve({ blog: 'content/blog', pages: 'content/pages', authorBios: 'content/authors' }),
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
      grammar: [segment('category'), locale({ optional: true }), slug()],
      metadata: { title: 'title', publishedTime: 'date' },
      references: { authors: 'authors', tags: 'tags' },
    }),
    pages: defineCollection({
      entry: 'page',
      base: '',
      grammar: [locale({ optional: true }), rest('path'), slug()],
      metadata: { title: 'title' },
      references: { authors: 'authors' },
    }),
    // Each author's long bio: no page of its own, shown on the author's page.
    authorBios: defineCollection({
      entry: 'authorBio',
      base: '',
      grammar: [locale({ optional: true }), slug()],
      mounted: false,
    }),
  },
  taxonomies: {
    authors: defineTaxonomy(
      { gustave: { avatar: '/g.svg' }, arnaud: { avatar: '/a.svg' } },
      // One post a page: gustave and arnaud have two pages in French.
      // Each author's page described by their bio, for its SEO.
      {
        messages: ['name', 'bio'],
        pages: { base: 'authors', perPage: 1, metadata: { description: 'bio' }, index: 'author-listing' },
        content: 'authorBios',
      },
    ),
    tags: defineTaxonomy(['bot']),
  },
  source,
});

/** Each document's collection, date and authors: gustave writes in both locales, arnaud in French only. */
const DOCUMENTS: readonly { collection: string; sourcePath: string; date?: string; authors: readonly string[] }[] = [
  { collection: 'blog', sourcePath: 'news/a.mdx', date: '2026-01-01', authors: ['gustave'] },
  { collection: 'blog', sourcePath: 'news/b.mdx', date: '2026-03-01', authors: ['gustave', 'arnaud'] },
  { collection: 'blog', sourcePath: 'news/en/a.mdx', date: '2026-01-01', authors: ['gustave'] },
  { collection: 'pages', sourcePath: 'about.mdx', authors: ['arnaud'] },
  // gustave's long bio, in French only.
  { collection: 'authorBios', sourcePath: 'gustave.mdx', authors: [] },
];

const Item = v.looseObject({ url: v.string() });
const Found = v.optional(
  v.looseObject({
    kind: v.string(),
    taxonomy: v.optional(v.string()),
    term: v.optional(
      v.looseObject({
        url: v.string(),
        locale: v.string(),
        taxonomy: v.string(),
        term: v.string(),
        alternates: v.record(v.string(), v.string()),
        entries: v.array(v.looseObject({ collection: v.string(), item: Item })),
        page: v.number(),
        pages: v.number(),
        first: v.string(),
        perPage: v.optional(v.number()),
        index: v.optional(v.string()),
        content: v.optional(v.looseObject({ key: v.string(), locale: v.string() })),
        metadata: v.object({ description: v.optional(v.string()) }),
      }),
    ),
  }),
);
const UrlsModule = v.looseObject({
  findByUrl: v.function(),
  mountedUrls: v.array(
    v.looseObject({
      kind: v.string(),
      collection: v.string(),
      url: v.string(),
      locale: v.string(),
      alternates: v.unknown(),
      searchable: v.boolean(),
      key: v.string(),
    }),
  ),
});

const folder = new FileSystem(join(import.meta.dirname, '..', '..', '.tmp', randomUUID()));
let termUrl: (term: string, locale: string) => unknown;
let listingIndexes: () => readonly { readonly url: string; readonly index: string }[];
let urls: {
  readonly findByUrl: (url: string) => Promise<v.InferOutput<typeof Found>>;
  readonly mountedUrls: v.InferOutput<typeof UrlsModule>['mountedUrls'];
};

beforeAll(async () => {
  const sources = DOCUMENTS.map(({ collection, sourcePath }) => ({ collection, sourcePath }));
  const assembly = assemble({
    analysis: analyze({ locales: config.locales, collections: config.collections, sources }),
    documents: DOCUMENTS.map(({ collection, sourcePath, date, authors }) => ({
      collection,
      sourcePath,
      data: { title: sourcePath, authors, ...(date === undefined ? {} : { date }) },
      body: '',
    })),
    sourceDiagnostics: [],
    collections: config.collections,
    taxonomies: config.taxonomies ?? {},
    environment: { drafts: 'include', testContent: 'include' },
  });

  // Precondition: the scenario is valid, so every file is generated.
  expect(assembly.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

  for (const file of emit({ config, assembly, outputDirectory: folder.basePath }))
    await folder.create(file.path, file.contents);

  const module = v.parse(UrlsModule, await import(pathToFileURL(join(folder.basePath, 'urls', 'index.js')).href));

  urls = { mountedUrls: module.mountedUrls, findByUrl: async (url) => v.parse(Found, await module.findByUrl(url)) };
  const terms = v.parse(
    v.looseObject({ authorsTermUrl: v.function(), authorsListingIndexes: v.function() }),
    await import(pathToFileURL(join(folder.basePath, 'terms', 'index.js')).href),
  );

  termUrl = (term, locale) => terms.authorsTermUrl(term, locale);
  listingIndexes = () =>
    v.parse(v.array(v.looseObject({ url: v.string(), index: v.string() })), terms.authorsListingIndexes());
});
afterAll(() => folder.cleanup());

describe('generated term pages, run', () => {
  it('mounts a page per author in each locale where they wrote, never searchable, with its translations', () => {
    const terms = urls.mountedUrls.filter((item) => item.kind === 'term');

    expect(terms.map((item) => item.url).sort()).toEqual([
      '/authors/arnaud',
      '/authors/arnaud/page/2',
      '/authors/gustave',
      '/authors/gustave/page/2',
      '/en/authors/gustave',
    ]);
    expect(terms.find((item) => item.url === '/authors/gustave')).toEqual({
      kind: 'term',
      collection: 'authors',
      url: '/authors/gustave',
      locale: 'fr',
      alternates: { fr: '/authors/gustave', en: '/en/authors/gustave' },
      searchable: false,
      llms: false,
      key: 'gustave',
      // Its newest post's date: news/b.
      modified: '2026-03-01',
      indexed: true,
    });
  });

  it('findByUrl finds a term page, its entries from every collection, resolved, newest first', async () => {
    const arnaud = await urls.findByUrl('/authors/arnaud');

    expect(arnaud).toMatchObject({ kind: 'term', taxonomy: 'authors', term: { term: 'arnaud', locale: 'fr' } });
    // The dated post first, then the undated page (newest first by date, then by collection).
    expect(arnaud?.term?.entries.map((entry) => [entry.collection, entry.item.url])).toEqual([
      ['blog', '/blog/news/b'],
      ['pages', '/about'],
    ]);
    const gustave = await urls.findByUrl('/en/authors/gustave');

    expect(gustave?.term?.entries.map((entry) => entry.item.url)).toEqual(['/en/blog/news/a']);
    expect(await urls.findByUrl('/authors/nobody')).toBeUndefined();
    expect(await urls.findByUrl('/en/authors/arnaud')).toBeUndefined();
  });

  it("finds a term's further page: the term with its page's number and URL, every entry listed (the app slices)", async () => {
    const second = await urls.findByUrl('/authors/gustave/page/2');

    expect(second?.term).toMatchObject({
      url: '/authors/gustave/page/2',
      term: 'gustave',
      page: 2,
      pages: 2,
      first: '/authors/gustave',
      perPage: 1,
      // Every page of a term shares its index.
      index: '/author-listing/gustave',
      // A page's translations are the same page elsewhere: English has one page only.
      alternates: { fr: '/authors/gustave/page/2' },
    });
    expect(second?.term?.entries.map((entry) => entry.item.url)).toEqual(['/blog/news/b', '/blog/news/a']);
    expect((await urls.findByUrl('/authors/gustave'))?.term).toMatchObject({ page: 1, pages: 2 });
    expect(await urls.findByUrl('/authors/gustave/page/3')).toBeUndefined();
    expect(urls.mountedUrls.find((item) => item.url === '/authors/gustave/page/2')?.alternates).toEqual({
      fr: '/authors/gustave/page/2',
    });
  });

  it('lists the term pages with an index once, each term’s first page in each locale, for their route', () => {
    expect(listingIndexes().map((page) => [page.url, page.index])).toEqual(
      listingIndexes()
        .filter((page) => !page.url.includes('/page/'))
        .map((page) => [page.url, page.url.replace('/authors/', '/author-listing/')]),
    );
    // Precondition: the authors' pages are listed, in both locales.
    expect(listingIndexes().map((page) => page.url)).toContain('/authors/gustave');
    expect(listingIndexes().some((page) => page.url.startsWith('/en/'))).toBe(true);
  });

  it("gives a term's page its own content in its locale, nothing where it has none, and never mounts it", async () => {
    expect((await urls.findByUrl('/authors/gustave'))?.term?.content).toMatchObject({ key: 'gustave', locale: 'fr' });
    expect((await urls.findByUrl('/en/authors/gustave'))?.term?.content).toBeUndefined();
    expect((await urls.findByUrl('/authors/arnaud'))?.term?.content).toBeUndefined();
    expect(urls.mountedUrls.filter((item) => item.collection === 'authorBios')).toEqual([]);
  });

  it("gives a term's page, and each of its further pages, its description's message key, for its SEO", async () => {
    const first = await urls.findByUrl('/authors/gustave');
    const second = await urls.findByUrl('/authors/gustave/page/2');

    expect(first?.term?.metadata).toEqual({ description: 'taxonomies.authors.gustave.bio' });
    expect(second?.term?.metadata).toEqual(first?.term?.metadata);
  });

  it("gives a term's page URL in a locale, nothing where the term has no page", () => {
    expect(termUrl('gustave', 'fr')).toBe('/authors/gustave');
    expect(termUrl('gustave', 'en')).toBe('/en/authors/gustave');
    // arnaud wrote in French only: no English page.
    expect(termUrl('arnaud', 'en')).toBeUndefined();
  });
});
