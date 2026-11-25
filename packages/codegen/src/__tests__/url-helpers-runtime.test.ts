// The generated URL helpers, run: the project's URL strategy, never rewritten by the app.
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { FileSystem } from '@japa/file-system';
import {
  analyze,
  assemble,
  createUrlBuilder,
  defineCollection,
  defineConfig,
  defineLocales,
  locale,
  rest,
  slug,
  type ContentSource,
  type UrlOptions,
} from '@figatellultimate/core';
import * as v from 'valibot';
import { afterAll, describe, expect, it } from 'vitest';

import { emit } from '../index.js';

const source: ContentSource = {
  directories: () => Promise.resolve({ pages: 'content/pages' }),
  async *documents() {
    yield* [];
    await Promise.resolve();
  },
};

const locales = defineLocales({ list: ['fr', 'en'], default: 'fr' });
const UrlHelpers = v.looseObject({ urlOf: v.function(), segmentsOf: v.function(), pageSegment: v.string() });
const folders: FileSystem[] = [];

/** The generated `#figatellultimate/urls` of a project with these URL options, imported. */
async function helpersFor(urls: UrlOptions) {
  const config = defineConfig({
    locales,
    urls,
    collections: {
      pages: defineCollection({ entry: 'page', base: '', grammar: [locale({ optional: true }), rest('path'), slug()] }),
    },
    source,
    splitRoutes: false,
  });
  const sources = [{ collection: 'pages', sourcePath: 'index.mdx' }];
  const assembly = assemble({
    analysis: analyze({ locales, collections: config.collections, sources }),
    documents: sources.map((s) => ({ ...s, data: {}, body: '' })),
    sourceDiagnostics: [],
    collections: config.collections,
    taxonomies: {},
    environment: { drafts: 'include', testContent: 'include' },
  });
  const folder = new FileSystem(join(import.meta.dirname, '..', '..', '.tmp', randomUUID()));

  folders.push(folder);

  for (const file of emit({ config, assembly, outputDirectory: folder.basePath }))
    await folder.create(file.path, file.contents);

  const module = v.parse(UrlHelpers, await import(pathToFileURL(join(folder.basePath, 'urls', 'index.js')).href));

  return {
    urlOf: (code: string, segments?: readonly string[]): unknown => module.urlOf(code, segments),
    segmentsOf: (url: string, code: string): unknown => module.segmentsOf(url, code),
    pageSegment: module.pageSegment,
  };
}

afterAll(async () => {
  for (const folder of folders) await folder.cleanup();
});

const ROUTES: readonly (readonly string[])[] = [[], ['docs'], ['docs', 'setup']];

describe('generated urlOf and segmentsOf', () => {
  it.each<[string, UrlOptions]>([
    ['the default locale unprefixed', {}],
    ['every locale prefixed', { defaultLocale: 'explicit' }],
    ['with a trailing slash', { trailingSlash: true }],
    ['every locale prefixed, with a trailing slash', { defaultLocale: 'explicit', trailingSlash: true }],
  ])('give the URLs of the core’s builder, and back: %s', async (_, options) => {
    const helpers = await helpersFor(options);
    const builder = createUrlBuilder(locales, options);

    for (const code of ['fr', 'en'] as const) {
      for (const segments of ROUTES) {
        const expected = builder.url({ locale: code, route: `/${segments.join('/')}` });

        expect(helpers.urlOf(code, segments)).toBe(expected);
        expect(helpers.segmentsOf(expected, code)).toEqual(segments);
      }
    }
  });

  it.each<[string, UrlOptions, string]>([
    ['page by default', {}, 'page'],
    ["the project's own", { page: 'p' }, 'p'],
  ])('export the segment of a further page, for the listings that read it back: %s', async (_, options, segment) => {
    expect((await helpersFor(options)).pageSegment).toBe(segment);
  });

  it('the home without segments', async () => {
    const helpers = await helpersFor({});

    expect(helpers.urlOf('fr')).toBe('/');
    expect(helpers.urlOf('en')).toBe('/en');
  });
});
