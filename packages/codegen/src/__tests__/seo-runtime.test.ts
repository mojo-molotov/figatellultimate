// The generated `lastmod` and `noindex` of every mounted URL, run: written to a disposable folder.
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
      grammar: [segment('category'), locale({ optional: true }), slug()],
      metadata: {
        title: 'title',
        publishedTime: 'date',
        modifiedTime: 'updated',
        robots: 'robots',
        schema: 'BlogPosting',
      },
      references: { authors: 'authors' },
      folderPages: { root: true, levels: ['category'] },
    }),
  },
  taxonomies: { authors: defineTaxonomy(['gustave'], { pages: { base: 'authors' } }) },
  source,
  splitRoutes: false,
});

/** a: published then updated; b: newer, but `noindex`; c: in another category, published only. */
const DOCUMENTS = [
  { sourcePath: 'news/a.mdx', data: { date: '2026-01-01', updated: '2026-02-01' } },
  { sourcePath: 'news/b.mdx', data: { date: '2026-03-01', robots: 'noindex, nofollow' } },
  { sourcePath: 'guides/c.mdx', data: { date: '2026-01-15' } },
] as const;

const Item = v.looseObject({
  url: v.string(),
  modified: v.optional(v.string()),
  indexed: v.boolean(),
  searchable: v.boolean(),
});
const UrlsModule = v.looseObject({ mountedUrls: v.array(Item), metadataFields: v.record(v.string(), v.unknown()) });

const folder = new FileSystem(join(import.meta.dirname, '..', '..', '.tmp', randomUUID()));
let urls: v.InferOutput<typeof UrlsModule>;
const item = (url: string) => urls.mountedUrls.find((candidate) => candidate.url === url);

beforeAll(async () => {
  const sources = DOCUMENTS.map(({ sourcePath }) => ({ collection: 'blog', sourcePath }));
  const assembly = assemble({
    analysis: analyze({ locales: config.locales, collections: config.collections, sources }),
    documents: DOCUMENTS.map(({ sourcePath, data }) => ({
      collection: 'blog',
      sourcePath,
      data: { title: sourcePath, authors: ['gustave'], ...data },
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

  urls = v.parse(UrlsModule, await import(pathToFileURL(join(folder.basePath, 'urls', 'index.js')).href));
});
afterAll(() => folder.cleanup());

describe('generated lastmod and noindex', () => {
  it('dates an entry by its modification date, else its publication date', () => {
    expect(item('/blog/news/a')).toMatchObject({ modified: '2026-02-01', indexed: true, searchable: true });
    expect(item('/blog/guides/c')).toMatchObject({ modified: '2026-01-15', indexed: true });
  });

  it('keeps a noindex entry mounted, but neither indexed nor searchable', () => {
    expect(item('/blog/news/b')).toMatchObject({ modified: '2026-03-01', indexed: false, searchable: false });
  });

  it('dates a folder or a term page by its newest indexed entry', () => {
    // b is newer, but noindex: it does not date the pages listing it.
    expect(item('/blog/news')).toMatchObject({ modified: '2026-02-01', indexed: true });
    expect(item('/blog/guides')).toMatchObject({ modified: '2026-01-15' });
    expect(item('/blog')).toMatchObject({ modified: '2026-02-01' });
    expect(item('/authors/gustave')).toMatchObject({ modified: '2026-02-01', indexed: true });
  });

  it('carries the SEO fields in metadataFields', () => {
    expect(urls.metadataFields['blog']).toMatchObject({
      modifiedTime: 'updated',
      robots: 'robots',
      schema: 'BlogPosting',
    });
  });
});
