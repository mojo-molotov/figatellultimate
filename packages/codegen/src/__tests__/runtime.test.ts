// The generated JavaScript, run: written to a disposable folder and imported as an app would.
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
  join as joinRoute,
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
  directories: () => Promise.resolve({ pages: 'content/pages', landingPages: 'content/lp' }),
  async *documents() {
    yield* [];
    await Promise.resolve();
  },
};

const config = defineConfig({
  locales: defineLocales({ list: ['fr', 'en'], default: 'fr' }),
  collections: {
    pages: defineCollection({
      entry: 'page',
      base: '',
      grammar: [locale({ optional: true }), rest('path'), slug()],
      reserved: ['lp/sign-up'],
      metadata: { title: 'title', description: 'metadescription' },
    }),
    landingPages: defineCollection({
      entry: 'landingPage',
      base: 'lp',
      grammar: [segment('category'), locale({ optional: true }), slug()],
      route: [joinRoute('-', 'category', 'slug')],
      metadata: { title: 'title', type: 'article' },
      searchable: false,
    }),
  },
  navigation: [{ collection: 'pages', depth: 0 }],
  taxonomies: {
    tags: defineTaxonomy(['bot', 'release']),
    authors: defineTaxonomy({ gustave: { avatar: '/a/gustave.svg', socials: ['x'] } }),
  },
  source,
});

/** The sample shapes: the home in both locales, `about` in French only, a reserved page, a flat landing page URL. */
const FILES: Readonly<Record<string, readonly string[]>> = {
  pages: ['index.mdx', 'en/index.mdx', 'about.mdx', 'docs/setup.mdx', 'en/docs/setup.mdx', 'lp/sign-up.mdx'],
  landingPages: ['promo/summer.mdx', 'promo/en/summer.mdx'],
};

// The generated modules are checked against what the tests read, not cast.
const NavigationModule = v.looseObject({ navigationOf: v.function() });
const NavigationItems = v.array(
  v.looseObject({ kind: v.string(), url: v.optional(v.string()), title: v.optional(v.string()) }),
);
const Found = v.optional(
  v.looseObject({
    collection: v.string(),
    entry: v.looseObject({ data: v.unknown(), url: v.string(), alternates: v.unknown() }),
  }),
);
const UrlsModule = v.looseObject({
  findByUrl: v.function(),
  mountedUrls: v.array(
    v.looseObject({
      collection: v.string(),
      url: v.string(),
      locale: v.string(),
      alternates: v.unknown(),
      searchable: v.boolean(),
      key: v.string(),
      home: v.optional(v.literal(true)),
    }),
  ),
  metadataFields: v.unknown(),
});

let navigation: { readonly navigationOf: (locale: string) => v.InferOutput<typeof NavigationItems> };
const folder = new FileSystem(join(import.meta.dirname, '..', '..', '.tmp', randomUUID()));
let urls: {
  readonly findByUrl: (url: string) => Promise<v.InferOutput<typeof Found>>;
  readonly mountedUrls: v.InferOutput<typeof UrlsModule>['mountedUrls'];
  readonly metadataFields: unknown;
};

beforeAll(async () => {
  const sources = Object.entries(FILES).flatMap(([collection, paths]) =>
    paths.map((sourcePath) => ({ collection, sourcePath })),
  );
  const assembly = assemble({
    analysis: analyze({ locales: config.locales, collections: config.collections, sources }),
    documents: sources.map((s) => ({
      ...s,
      data: { title: `Title of ${s.sourcePath}` },
      body: `Body of ${s.sourcePath}`,
    })),
    sourceDiagnostics: [],
    collections: config.collections,
    taxonomies: {},
    environment: { drafts: 'include', testContent: 'include' },
  });

  // Precondition: the scenario is valid, so every file is generated.
  expect(assembly.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

  for (const file of emit({ config, assembly, outputDirectory: folder.basePath }))
    await folder.create(file.path, file.contents);

  const urlsModule = v.parse(UrlsModule, await import(pathToFileURL(join(folder.basePath, 'urls', 'index.js')).href));

  urls = {
    mountedUrls: urlsModule.mountedUrls,
    metadataFields: urlsModule.metadataFields,
    findByUrl: async (url) => v.parse(Found, await urlsModule.findByUrl(url)),
  };
  const navigationModule = v.parse(
    NavigationModule,
    await import(pathToFileURL(join(folder.basePath, 'navigation', 'index.js')).href),
  );

  navigation = { navigationOf: (locale) => v.parse(NavigationItems, navigationModule.navigationOf(locale)) };
});
afterAll(() => folder.cleanup());

describe('generated urls module, run', () => {
  it('finds an entry of any collection by the URL the build produced, data included', async () => {
    const page = await urls.findByUrl('/en/docs/setup');

    expect(page?.collection).toBe('pages');
    expect(page?.entry.data).toEqual({ title: 'Title of en/docs/setup.mdx' });
    expect((await urls.findByUrl('/'))?.entry.url).toBe('/');
    expect((await urls.findByUrl('/en'))?.entry.url).toBe('/en');
    expect((await urls.findByUrl('/lp/promo-summer'))?.collection).toBe('landingPages');
    expect(await urls.findByUrl('/nope')).toBeUndefined();
  });

  it('lists every mounted URL once, leaving reserved entries to their dedicated routes', async () => {
    const mounted = urls.mountedUrls.map((item) => item.url);

    expect([...mounted].sort()).toEqual([
      '/',
      '/about',
      '/docs/setup',
      '/en',
      '/en/docs/setup',
      '/en/lp/promo-summer',
      '/lp/promo-summer',
    ]);
    expect(new Set(mounted).size).toBe(mounted.length);
    expect(await urls.findByUrl('/lp/sign-up')).toBeUndefined();
  });

  it("marks each locale's home, the route /, and no other page", () => {
    expect(
      urls.mountedUrls
        .filter((item) => item.home === true)
        .map((item) => item.url)
        .sort(),
    ).toEqual(['/', '/en']);
  });

  it('carries every entry’s existing translations, in the declared locale order', () => {
    const byUrl = new Map(urls.mountedUrls.map((item) => [item.url, item.alternates]));

    expect(byUrl.get('/docs/setup')).toEqual({ fr: '/docs/setup', en: '/en/docs/setup' });
    expect(byUrl.get('/about')).toEqual({ fr: '/about' });
    expect(byUrl.get('/en/lp/promo-summer')).toEqual({ fr: '/lp/promo-summer', en: '/en/lp/promo-summer' });
  });

  it('marks whether each mounted URL is searchable, from its collection', () => {
    const searchable = Object.fromEntries(urls.mountedUrls.map((item) => [item.url, item.searchable]));

    expect(searchable['/docs/setup']).toBe(true);
    expect(searchable['/lp/promo-summer']).toBe(false);
  });

  it('exports each collection’s declared metadata fields, so an app never imports the config', () => {
    expect(urls.metadataFields).toEqual({
      pages: { title: 'title', description: 'metadescription' },
      landingPages: { title: 'title', type: 'article' },
    });
  });
});

describe('generated navigation module, run', () => {
  it('gives each locale the root entries that exist in it, home first, reserved ones left out', () => {
    expect(navigation.navigationOf('fr').map((node) => [node.kind, node.url, node.title])).toEqual([
      ['entry', '/', 'Title of index.mdx'],
      ['entry', '/about', 'Title of about.mdx'],
    ]);
    expect(navigation.navigationOf('en').map((node) => node.url)).toEqual(['/en']);
  });

  it('mountedUrls carry each entry’s key, for the locale switcher', () => {
    const keys = Object.fromEntries(urls.mountedUrls.map((item) => [item.url, item.key]));

    expect(keys['/en/docs/setup']).toBe('docs/setup');
    expect(keys['/']).toBe('');
    expect(keys['/lp/promo-summer']).toBe('promo/summer');
  });
});

describe('generated taxonomies module', () => {
  it('gives every taxonomy’s terms and data, so an app never imports the config', async () => {
    const generated: unknown = await import(pathToFileURL(join(folder.basePath, 'taxonomies', 'index.js')).href);

    expect(generated).toHaveProperty('taxonomies', {
      tags: { terms: ['bot', 'release'], data: null },
      authors: { terms: ['gustave'], data: { gustave: { avatar: '/a/gustave.svg', socials: ['x'] } } },
    });
  });
});
