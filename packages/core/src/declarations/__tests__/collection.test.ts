import { describe, expect, it } from 'vitest';

import { defineCollection, exposedToLlms, InvalidCollectionError } from '../collection.js';
import { join, locale, rest, segment, slug } from '../grammar.js';
import { blog, blogWithContent, landingPages, pages } from '../../__tests__/scenarios/collections.js';

describe('defineCollection', () => {
  it('expresses the three sample collections', () => {
    expect(pages.entry).toBe('page');
    expect(blog.maxNameLength).toBe(34);
    expect(landingPages.route).toEqual([{ kind: 'join', separator: '-', names: ['category', 'slug'] }]);
  });

  it('defaults the route to the segments in grammar order, then the slug', () => {
    expect(blog.route).toEqual(['category', 'subcategory', 'slug']);
    expect(pages.route).toEqual(['path', 'slug']);
  });

  it('defaults maxNameLength to 80, reserved and indexForbiddenUnder to nothing, indexForbiddenAtRoot to false', () => {
    expect(pages.maxNameLength).toBe(80);
    expect(pages.indexForbiddenUnder).toEqual([]);
    expect(pages.indexForbiddenAtRoot).toBe(false);
    expect(landingPages.indexForbiddenAtRoot).toBe(true);
    expect(blog.reserved).toEqual([]);
  });

  it('returns deeply frozen plain data', () => {
    expect(Object.isFrozen(blog)).toBe(true);
    expect(Object.isFrozen(blog.grammar)).toBe(true);
    expect(Object.isFrozen(blog.grammar[0])).toBe(true);
    expect(Object.isFrozen(landingPages.route[0])).toBe(true);
    expect(JSON.parse(JSON.stringify(blog))).toEqual(blog);
  });

  const valid = { entry: 'post', base: 'blog', grammar: [segment('category'), slug()] } as const;

  it.each<[string, unknown]>([
    ['an entry name that is not camelCase', { ...valid, entry: 'blog-post' }],
    ['an invalid base', { ...valid, base: 'Blog' }],
    ['a grammar not ending with slug()', { ...valid, grammar: [slug(), segment('category')] }],
    ['two slug() parts', { ...valid, grammar: [slug(), slug()] }],
    ['two locale() parts', { ...valid, grammar: [locale(), locale(), slug()] }],
    ['two rest() parts', { ...valid, grammar: [rest('a'), rest('b'), slug()] }],
    ['duplicate segment names', { ...valid, grammar: [segment('a'), segment('a'), slug()] }],
    ['a reserved segment name', { ...valid, grammar: [segment('slug'), slug()] }],
    ['a segment name that is not an identifier', { ...valid, grammar: [segment('sub-category'), slug()] }],
    ['a locale after a rest segment', { ...valid, grammar: [rest('path'), locale(), slug()] }],
    ['a route naming an unknown segment', { ...valid, route: ['nope'] }],
    ['a join naming an unknown segment', { ...valid, route: [join('-', 'category', 'nope')] }],
    ['an empty join', { ...valid, route: [join('-')] }],
    ['indexForbiddenUnder naming an unknown segment', { ...valid, indexForbiddenUnder: ['nope'] }],
    ['indexForbiddenUnder naming the root', { ...valid, indexForbiddenUnder: [''] }],
    ['a non-boolean indexForbiddenAtRoot', { ...valid, indexForbiddenAtRoot: 'yes' }],
    ['a maxNameLength below 1', { ...valid, maxNameLength: 0 }],
    ['an invalid reserved pattern', { ...valid, reserved: ['lp/Sign-Up'] }],
  ])('throws InvalidCollectionError on %s', (_, input) => {
    expect(() =>
      // @ts-expect-error -- an untyped (JS or JSON) caller: validated at runtime.
      defineCollection(input),
    ).toThrow(InvalidCollectionError);
  });

  it('keeps references, the draft field and test-only patterns', () => {
    expect(blogWithContent.references).toEqual({ tags: 'tags', authors: 'authors' });
    expect(blogWithContent.draft).toBe('draft');
    expect(blogWithContent.testOnly).toEqual(['blog-testing-category/*']);
    expect(blog.references).toEqual({});
    expect(blog.draft).toBeNull();
    expect(blog.testOnly).toEqual([]);
  });

  it('keeps the fields translations share, none by default', () => {
    expect(defineCollection({ ...valid, shared: ['cover', 'date'] }).shared).toEqual(['cover', 'date']);
    expect(blog.shared).toEqual([]);
  });

  it.each<[string, unknown]>([
    ['an empty reference field', { ...valid, references: { '': 'tags' } }],
    ['an empty referenced taxonomy', { ...valid, references: { tags: '' } }],
    ['an empty draft field', { ...valid, draft: '' }],
    ['an invalid test-only pattern', { ...valid, testOnly: ['Test/*'] }],
    ['an empty shared field', { ...valid, shared: [''] }],
    ['the inheritance marker as a shared field', { ...valid, shared: ['inherit'] }],
    ['a shared field listed twice', { ...valid, shared: ['date', 'date'] }],
  ])('throws InvalidCollectionError on %s', (_, input) => {
    expect(() =>
      // @ts-expect-error -- an untyped (JS or JSON) caller: validated at runtime.
      defineCollection(input),
    ).toThrow(InvalidCollectionError);
  });

  it('accepts reserved keys and key prefixes', () => {
    const collection = defineCollection({ ...valid, reserved: ['news/launch', 'news/*'] });

    expect(collection.reserved).toEqual(['news/launch', 'news/*']);
  });
});

describe('defineCollection: required message fields', () => {
  const grammar = [segment('category'), segment('subcategory'), locale({ optional: true }), slug()] as const;

  it('keeps the fields declared per segment, frozen, and none by default', () => {
    const declared = defineCollection({
      entry: 'blogPost',
      base: 'blog',
      grammar,
      messages: { category: ['title', 'meta-description'], subcategory: ['title'] },
    });

    expect(declared.messages).toEqual({ category: ['title', 'meta-description'], subcategory: ['title'] });
    expect(Object.isFrozen(declared.messages)).toBe(true);
    expect(Object.isFrozen(declared.messages.category)).toBe(true);
    expect(defineCollection({ entry: 'blogPost', base: 'blog', grammar }).messages).toEqual({});
  });

  it.each<[string, unknown]>([
    ['an unknown segment', { slug: ['title'] }],
    ['an empty field list', { category: [] }],
    ['an empty field name', { category: [''] }],
    ['a dotted field name', { category: ['seo.title'] }],
    ['the reserved `$`', { category: ['$'] }],
    ['a duplicate field', { category: ['title', 'title'] }],
  ])('throws InvalidCollectionError on %s', (_, messages) => {
    expect(() =>
      // @ts-expect-error -- an untyped (JS or JSON) caller: validated at runtime.
      defineCollection({ entry: 'blogPost', base: 'blog', grammar, messages }),
    ).toThrow(InvalidCollectionError);
  });
});

describe('defineCollection: metadata fields', () => {
  const grammar = [locale({ optional: true }), rest('path'), slug()] as const;

  it('keeps the declared frontmatter fields and the Open Graph type, frozen, and none by default', () => {
    const declared = defineCollection({
      entry: 'page',
      base: '',
      grammar,
      metadata: { title: 'title', description: 'metadescription', image: 'featuredPictureUrl', type: 'article' },
    });

    expect(declared.metadata).toEqual({
      title: 'title',
      description: 'metadescription',
      image: 'featuredPictureUrl',
      type: 'article',
    });
    expect(Object.isFrozen(declared.metadata)).toBe(true);
    expect(defineCollection({ entry: 'page', base: '', grammar }).metadata).toEqual({});
  });

  it('keeps the SEO fields and the schema.org type', () => {
    const metadata = {
      modifiedTime: 'updated',
      robots: 'robots',
      canonical: 'canonical',
      schema: 'BlogPosting',
    } as const;

    expect(defineCollection({ entry: 'page', base: '', grammar, metadata }).metadata).toEqual(metadata);
  });

  it.each<[string, unknown]>([
    ['an empty field name', { title: '' }],
    ['an unknown key', { subtitle: 'subtitle' }],
    ['an unknown Open Graph type', { type: 'video' }],
    ['an unknown schema.org type', { schema: 'Recipe' }],
    ['an empty robots field', { robots: '' }],
  ])('throws InvalidCollectionError on %s', (_, metadata) => {
    expect(() =>
      // @ts-expect-error -- an untyped (JS or JSON) caller: validated at runtime.
      defineCollection({ entry: 'page', base: '', grammar, metadata }),
    ).toThrow(InvalidCollectionError);
  });
});

describe('defineCollection: searchable', () => {
  const grammar = [locale({ optional: true }), rest('path'), slug()] as const;

  it('is searchable by default, and can opt out', () => {
    expect(defineCollection({ entry: 'page', base: '', grammar }).searchable).toBe(true);
    expect(defineCollection({ entry: 'page', base: '', grammar, searchable: false }).searchable).toBe(false);
  });

  it('throws on a non-boolean', () => {
    expect(() =>
      // @ts-expect-error -- an untyped (JS or JSON) caller: validated at runtime.
      defineCollection({ entry: 'page', base: '', grammar, searchable: 'no' }),
    ).toThrow(InvalidCollectionError);
  });
});

describe('defineCollection: llms', () => {
  const grammar = [locale({ optional: true }), rest('path'), slug()] as const;

  it('exposes nothing by default; keeps what it exposes and its exclusion field, frozen', () => {
    expect(defineCollection({ entry: 'page', base: '', grammar }).llms).toBeNull();
    const collection = defineCollection({
      entry: 'page',
      base: '',
      grammar,
      llms: { include: ['docs', 'docs/*'], exclude: 'llmExclude' },
    });

    expect(collection.llms).toEqual({ include: ['docs', 'docs/*'], exclude: 'llmExclude' });
    expect(Object.isFrozen(collection.llms)).toBe(true);
    expect(Object.isFrozen(collection.llms?.include)).toBe(true);
    expect(
      defineCollection({ entry: 'page', base: '', grammar, llms: { include: ['docs'] } }).llms?.exclude,
    ).toBeNull();
  });

  it.each<[string, unknown]>([
    ['no pattern', { include: [] }],
    ['patterns that are not a list', { include: 'docs' }],
    ['an invalid pattern', { include: ['Docs/*'] }],
    ['an empty exclusion field', { include: ['docs'], exclude: '' }],
  ])('throws InvalidCollectionError on %s', (_, llms) => {
    expect(() =>
      // @ts-expect-error -- an untyped (JS or JSON) caller: validated at runtime.
      defineCollection({ entry: 'page', base: '', grammar, llms }),
    ).toThrow(InvalidCollectionError);
  });

  it('throws on a collection without pages: nothing to link', () => {
    expect(() =>
      defineCollection({ entry: 'page', base: '', grammar, mounted: false, llms: { include: ['docs'] } }),
    ).toThrow(InvalidCollectionError);
  });

  it.each<[string, string, Readonly<Record<string, unknown>>, boolean]>([
    ['the exact key', 'docs', {}, true],
    ["a prefix's descendant", 'docs/install', {}, true],
    ['a key outside the patterns', 'blog/post', {}, false],
    ['a prefix itself, under `docs/*` alone', 'guides', {}, false],
    ['an entry whose exclusion field is true', 'docs/install', { llmExclude: true }, false],
    ['an entry whose exclusion field is false', 'docs/install', { llmExclude: false }, true],
  ])('exposes %s as told', (_, key, data, exposed) => {
    const collection = defineCollection({
      entry: 'page',
      base: '',
      grammar,
      llms: { include: ['docs', 'docs/*', 'guides/*'], exclude: 'llmExclude' },
    });

    expect(exposedToLlms(collection, key, data)).toBe(exposed);
  });

  it('exposes nothing from a collection that declares nothing', () => {
    expect(exposedToLlms(defineCollection({ entry: 'page', base: '', grammar }), 'docs', {})).toBe(false);
  });
});

describe('defineCollection: mounted', () => {
  const grammar = [locale({ optional: true }), slug()] as const;

  it('is mounted by default, and can have no page at all', () => {
    expect(defineCollection({ entry: 'page', base: '', grammar }).mounted).toBe(true);
    expect(defineCollection({ entry: 'authorBio', base: '', grammar, mounted: false }).mounted).toBe(false);
  });

  it('throws on a non-boolean, and on folder pages for a collection without pages', () => {
    expect(() =>
      // @ts-expect-error -- an untyped (JS or JSON) caller: validated at runtime.
      defineCollection({ entry: 'page', base: '', grammar, mounted: 'no' }),
    ).toThrow(InvalidCollectionError);
    expect(() =>
      defineCollection({
        entry: 'blogPost',
        base: 'blog',
        grammar: [segment('category'), locale({ optional: true }), slug()],
        folderPages: { levels: ['category'] },
        mounted: false,
      }),
    ).toThrow('an unmounted collection has no pages');
  });
});

describe('defineCollection: folderPages', () => {
  const blogGrammar = [segment('category'), segment('subcategory'), locale({ optional: true }), slug()] as const;
  const define = (folderPages: unknown, extra: Record<string, unknown> = {}) =>
    // @ts-expect-error -- an untyped (JS or JSON) caller: validated at runtime.
    defineCollection({ entry: 'blogPost', base: 'blog', grammar: blogGrammar, folderPages, ...extra });

  it('defaults to no folder page, and to a preview of 2', () => {
    expect(defineCollection({ entry: 'blogPost', base: 'blog', grammar: blogGrammar }).folderPages).toBeNull();
    expect(define({ levels: ['category'] }).folderPages).toEqual({
      root: false,
      levels: ['category'],
      preview: 2,
      images: {},
      perPage: {},
      metadata: {},
    });
    expect(define({ root: true, levels: ['category', 'subcategory'], preview: 3 }).folderPages).toEqual({
      root: true,
      levels: ['category', 'subcategory'],
      preview: 3,
      images: {},
      perPage: {},
      metadata: {},
    });
  });

  it('keeps the images declared per folder path, frozen', () => {
    const declared = define({
      levels: ['category'],
      images: { news: '/covers/news.jpeg', 'news/bot': '/covers/bot.jpeg' },
    }).folderPages;

    expect(declared?.images).toEqual({ news: '/covers/news.jpeg', 'news/bot': '/covers/bot.jpeg' });
    expect(Object.isFrozen(declared?.images)).toBe(true);
  });

  it('keeps a page size per level, and for the root, frozen', () => {
    const declared = define({
      root: true,
      levels: ['category', 'subcategory'],
      perPage: { root: 4, subcategory: 5 },
    }).folderPages;

    expect(declared?.perPage).toEqual({ root: 4, subcategory: 5 });
    expect(Object.isFrozen(declared?.perPage)).toBe(true);
  });

  it('keeps the segment of its listings’ indexes, for a paginated level listing entries', () => {
    const declared = define({ levels: ['category', 'subcategory'], perPage: { subcategory: 5 }, index: 'listing' });

    expect(declared.folderPages?.index).toBe('listing');
    expect(define({ levels: ['category'] }).folderPages).not.toHaveProperty('index');
  });

  it("keeps the SEO description it reads from each folder's messages, frozen", () => {
    const declared = define(
      { root: true, levels: ['category', 'subcategory'], metadata: { description: 'description' } },
      {
        messages: {
          $root: ['description'],
          category: ['title', 'description'],
          subcategory: ['title', 'description'],
        },
      },
    ).folderPages;

    expect(declared?.metadata).toEqual({ description: 'description' });
    expect(
      define({ root: true, levels: ['category'] }, { messages: { $root: ['description'], category: ['title'] } })
        .messages,
    ).toEqual({ $root: ['description'], category: ['title'] });
    expect(Object.isFrozen(declared?.metadata)).toBe(true);
  });

  it.each([
    ['metadata that is not an object', { levels: ['category'], metadata: 'description' }, {}, /metadata/],
    ['a description that is not a field name', { levels: ['category'], metadata: { description: 1 } }, {}, /metadata/],
    [
      'a description a level does not declare in its messages',
      { levels: ['category', 'subcategory'], metadata: { description: 'description' } },
      { messages: { category: ['title', 'description'], subcategory: ['title'] } },
      /messages\.subcategory/,
    ],
    [
      "a description the collection's own page does not declare",
      { root: true, levels: ['category'], metadata: { description: 'description' } },
      { messages: { category: ['title', 'description'] } },
      /messages\.\$root/,
    ],
    [
      "messages for the collection's own page without its page",
      { levels: ['category'] },
      { messages: { $root: ['description'] } },
      /folderPages\.root/,
    ],
  ])('rejects %s', (_, folderPages, extra, message) => {
    expect(() => define(folderPages, extra)).toThrow(message);
  });

  it.each([
    ['images that are not an object', { levels: ['category'], images: ['/a.jpeg'] }, /images/],
    ['an empty image', { levels: ['category'], images: { news: '' } }, /images/],
    ['a folder path deeper than the folders', { levels: ['category'], images: { 'a/b/c': '/a.jpeg' } }, /images/],
    ['an invalid folder name', { levels: ['category'], images: { News: '/a.jpeg' } }, /images/],
    ['an unknown segment', { levels: ['slug'] }, /unknown segment "slug"/],
    ['a negative preview', { levels: ['category'], preview: -1 }, /preview/],
    ['a non-boolean root', { root: 'yes', levels: [] }, /root/],
    ['levels that are not a list', { levels: 'category' }, /levels/],
    ['a page size that is not an object', { levels: ['category'], perPage: 5 }, /perPage/],
    ['a page size for a level without pages', { levels: ['category'], perPage: { subcategory: 5 } }, /perPage/],
    [
      'an index that is not a URL segment',
      { levels: ['subcategory'], perPage: { subcategory: 5 }, index: 'List/ing' },
      /folderPages\.index/,
    ],
    ['an index without the level listing entries', { levels: ['category'], index: 'listing' }, /folderPages\.index/],
    ['an index for a listing without a page size', { levels: ['subcategory'], index: 'listing' }, /folderPages\.index/],
    ['a page size of zero', { levels: ['category'], perPage: { category: 0 } }, /perPage/],
    ['a fractional page size', { levels: ['category'], perPage: { category: 2.5 } }, /perPage/],
    ['a page size for the root without its page', { levels: ['category'], perPage: { root: 3 } }, /perPage/],
  ])('rejects %s', (_, folderPages, message) => {
    expect(() => define(folderPages)).toThrow(message);
  });

  it('rejects a free-depth segment, and a custom route composition', () => {
    expect(() =>
      defineCollection({
        entry: 'page',
        base: '',
        grammar: [locale({ optional: true }), rest('path'), slug()],
        folderPages: { levels: ['path'] },
      }),
    ).toThrow(/free-depth segment "path"/);
    expect(() => define({ levels: ['category'] }, { route: ['slug'] })).toThrow(/default route/);
  });
});
