import { describe, expect, it } from 'vitest';

import { defineConfig, InvalidConfigError, parseConfig, type FigatellultimateConfig } from '../config.js';
import type { ContentSource } from '../content/ports.js';
import { defineCollection } from '../declarations/collection.js';
import { locale, segment, slug } from '../declarations/grammar.js';
import { defineTaxonomy } from '../declarations/taxonomy.js';
import { blog, locales, pages, tags } from './scenarios/collections.js';

const source: ContentSource = {
  directories: () => Promise.resolve({ pages: 'content/pages', blog: 'content/blog' }),
  async *documents() {
    yield* [];
    await Promise.resolve();
  },
};

const valid: FigatellultimateConfig = { locales, collections: { pages, blog }, taxonomies: { tags }, source };

describe('defineConfig', () => {
  it('returns the config frozen, with the default output folder', () => {
    const config = defineConfig(valid);

    expect(config.output).toBe('.figatellultimate');
    expect(config.publicDirectory).toBe('public');
    expect(config.collections).toEqual({ pages, blog });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('reads `.mdx` files only by default, and the extensions a project adds', () => {
    expect(defineConfig(valid).extensions).toEqual(['.mdx']);
    const config = defineConfig({ ...valid, extensions: ['.mdx', '.md'] });

    expect(config.extensions).toEqual(['.mdx', '.md']);
    expect(Object.isFrozen(config.extensions)).toBe(true);
  });

  it('keeps an explicit output folder and URL options', () => {
    const config = defineConfig({
      ...valid,
      output: 'generated/figatellultimate',
      publicDirectory: 'static',
      urls: { defaultLocale: 'explicit' },
    });

    expect(config.output).toBe('generated/figatellultimate');
    expect(config.publicDirectory).toBe('static');
    expect(config.urls).toEqual({ defaultLocale: 'explicit' });
  });

  it.each([
    ['no locales', { ...valid, locales: undefined }],
    ['locales not made with defineLocales', { ...valid, locales: { list: ['fr'] } }],
    ['no collection', { ...valid, collections: {} }],
    ['a collection not made with defineCollection', { ...valid, collections: { pages: { entry: 'page' } } }],
    ['a collection name that is not an identifier', { ...valid, collections: { 'my-pages': pages } }],
    ['a source without documents()', { ...valid, source: { directories: () => source.directories() } }],
    ['an absolute output folder', { ...valid, output: '/abs' }],
    ['an output folder outside the project', { ...valid, output: '../out' }],
    ['an absolute public folder', { ...valid, publicDirectory: '/srv/public' }],
    ['a public folder outside the project', { ...valid, publicDirectory: '../public' }],
    ['a taxonomy not made with defineTaxonomy', { ...valid, taxonomies: { tags: ['a'] } }],
    ['no extension at all', { ...valid, extensions: [] }],
    ['an extension without its dot', { ...valid, extensions: ['md'] }],
    ['an extension in capitals', { ...valid, extensions: ['.MD'] }],
    ['the same extension twice', { ...valid, extensions: ['.md', '.md'] }],
  ])('throws InvalidConfigError on %s', (_, input) => {
    // Runtime validation of what the types already reject: configs are loaded from user files.
    expect(() => parseConfig(input)).toThrow(InvalidConfigError);
  });
});

describe('defineConfig: messages', () => {
  it('keeps the messages folder and the declared runtime', () => {
    const config = defineConfig({ ...valid, messages: { directory: 'messages', runtime: 'use-intl' } });

    expect(config.messages).toEqual({ directory: 'messages', runtime: 'use-intl' });
  });

  it('keeps the schema module, a file of the folder', () => {
    const config = defineConfig({ ...valid, messages: { directory: 'messages', schema: 'schema.ts' } });

    expect(config.messages).toEqual({ directory: 'messages', schema: 'schema.ts' });
  });

  it.each([
    ['an absolute folder', { directory: '/messages' }],
    ['a parent folder', { directory: '../messages' }],
    ['an empty folder', { directory: '' }],
    ['an unknown runtime', { directory: 'messages', runtime: 'i18next' }],
    ['a schema outside the folder', { directory: 'messages', schema: '../schema.ts' }],
    ['a schema that is not a TypeScript module', { directory: 'messages', schema: 'schema.json' }],
    ['a schema named after a locale', { directory: 'messages', schema: 'fr.ts' }],
  ])('throws InvalidConfigError on %s', (_, messages) => {
    expect(() => parseConfig({ ...valid, messages })).toThrow(InvalidConfigError);
  });
});

describe('defineConfig: navigation', () => {
  const metadata = { title: 'title' } as const;
  const titled = {
    pages: defineCollection({ ...pages, messages: { path: ['title'] }, metadata }),
    blog: defineCollection({ ...blog, messages: { category: ['title'], subcategory: ['title'] }, metadata }),
  };
  const withNavigation = (navigation: unknown, collections: FigatellultimateConfig['collections'] = titled) =>
    parseConfig({ ...valid, collections, messages: { directory: 'messages' }, navigation });

  it('keeps a valid navigation, frozen', () => {
    const config = withNavigation([
      { collection: 'pages', depth: 1 },
      { collection: 'blog', depth: 2, label: 'nav.blog' },
    ]);

    expect(config.navigation).toEqual([
      { collection: 'pages', depth: 1 },
      { collection: 'blog', depth: 2, label: 'nav.blog' },
    ]);
    expect(Object.isFrozen(config.navigation)).toBe(true);
  });

  it("keeps `menus: false`: the collection's sections are links, not menus", () => {
    const config = withNavigation([{ collection: 'pages', depth: 1, menus: false }]);

    expect(config.navigation).toEqual([{ collection: 'pages', depth: 1, menus: false }]);
  });

  it('accepts depth 0 without any title: only the entries at the root', () => {
    const plain = { pages: defineCollection({ ...pages, metadata }), blog };

    expect(() => withNavigation([{ collection: 'pages', depth: 0 }], plain)).not.toThrow();
  });

  it('requires metadata.title: entries are labelled by their title', () => {
    expect(() => withNavigation([{ collection: 'pages', depth: 0 }], { pages, blog })).toThrow(/metadata.title/);
  });

  it.each([
    ['an unknown collection', [{ collection: 'docs', depth: 1 }], /unknown collection "docs"/],
    [
      'a collection twice',
      [
        { collection: 'pages', depth: 1 },
        { collection: 'pages', depth: 0 },
      ],
      /twice/,
    ],
    ['a negative depth', [{ collection: 'pages', depth: -1 }], /depth/],
    ['a fractional depth', [{ collection: 'pages', depth: 1.5 }], /depth/],
    ['an empty label', [{ collection: 'blog', depth: 0, label: '' }], /label/],
    ['not a list', { pages: 1 }, /list/],
    ['menus that is not a boolean', [{ collection: 'pages', depth: 1, menus: 'no' }], /menus/],
  ])('throws on %s', (_, navigation, message) => {
    expect(() => withNavigation(navigation)).toThrow(message);
  });

  it('requires a title for every segment the depth reaches', () => {
    const untitled = {
      pages: defineCollection({ ...pages, metadata }),
      blog: defineCollection({ ...blog, messages: { category: ['title'] }, metadata }),
    };

    // Depth 1 only reaches the category: fine.
    expect(() => withNavigation([{ collection: 'blog', depth: 1 }], untitled)).not.toThrow();
    expect(() => withNavigation([{ collection: 'blog', depth: 2 }], untitled)).toThrow(
      /blog: segment "subcategory" needs a "title" message/,
    );
    expect(() => withNavigation([{ collection: 'pages', depth: 1 }], untitled)).toThrow(/segment "path"/);
  });

  it('requires messages for labels and titles', () => {
    expect(() =>
      defineConfig({ ...valid, collections: titled, navigation: [{ collection: 'pages', depth: 1 }] }),
    ).toThrow(/needs `messages`/);
  });
});

describe("defineConfig: a taxonomy's content", () => {
  const authors = defineTaxonomy(['gustave'], { pages: { base: 'authors' }, content: 'authorBios' });
  const bios = (extra: Record<string, unknown> = {}) =>
    defineCollection({
      entry: 'authorBio',
      base: '',
      grammar: [locale({ optional: true }), slug()],
      mounted: false,
      ...extra,
    });

  it('accepts an unmounted collection keyed by term', () => {
    const config = defineConfig({
      ...valid,
      collections: { pages, blog, authorBios: bios() },
      taxonomies: { authors },
    });

    expect(config.taxonomies?.['authors']?.content).toBe('authorBios');
  });

  it.each([
    ['an undeclared collection', { pages, blog }, 'is not a declared collection'],
    ['a mounted collection', { pages, blog, authorBios: bios({ mounted: true }) }, 'must be unmounted'],
    [
      'a collection with folders',
      {
        pages,
        blog,
        authorBios: defineCollection({
          entry: 'authorBio',
          base: '',
          grammar: [segment('team'), locale({ optional: true }), slug()],
          mounted: false,
        }),
      },
      'must be keyed by term',
    ],
  ])('throws InvalidConfigError on %s, with what to do', (_, collections, problem) => {
    expect(() => parseConfig({ ...valid, collections, taxonomies: { authors } })).toThrow(problem);
  });
});
