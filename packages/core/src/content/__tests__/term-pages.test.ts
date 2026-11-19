import { describe, expect, it } from 'vitest';

import { blog, locales, pages } from '../../__tests__/scenarios/collections.js';
import { defineConfig, InvalidConfigError } from '../../config.js';
import { defineCollection } from '../../declarations/collection.js';
import { defineTaxonomy, InvalidTaxonomyError } from '../../declarations/taxonomy.js';
import { analyze, type SourceInput } from '../../paths/analyze.js';
import { folderPagesOf } from '../../paths/folders.js';
import { createUrlBuilder } from '../../paths/url.js';
import type { ContentSource } from '../ports.js';
import { termPageCollisions, termPagesOf, type TermsOf } from '../term-pages.js';

const authors = defineTaxonomy(['gustave', 'arnaud', 'nadia'], { pages: { base: 'authors' } });
const tags = defineTaxonomy(['bot', 'release']);
const taxonomies = { authors, tags };
const collections = {
  blog: defineCollection({ ...blog, references: { authors: 'authors', tags: 'tags' } }),
  pages: defineCollection({ ...pages, references: { authors: 'authors' } }),
};

const src = (collection: string, ...paths: string[]): SourceInput[] =>
  paths.map((sourcePath) => ({ collection, sourcePath }));

/** Every entry's authors and tags, by path. */
const TERMS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  'news/bot/post-01.mdx': { authors: ['gustave'], tags: ['bot'] },
  'news/bot/en/post-01.mdx': { authors: ['gustave'], tags: ['bot'] },
  'news/bot/post-02.mdx': { authors: ['arnaud', 'gustave'], tags: [] },
  'docs/setup.mdx': { authors: ['arnaud'] },
  // Reserved (`lp/sign-up`): never counts, so nadia has no page.
  'lp/sign-up.mdx': { authors: ['nadia'] },
};

const kept = (): TermsOf[] => {
  const sources = [
    ...src('blog', 'news/bot/post-01.mdx', 'news/bot/en/post-01.mdx', 'news/bot/post-02.mdx'),
    ...src('pages', 'docs/setup.mdx', 'lp/sign-up.mdx'),
  ];
  const analysis = analyze({ locales, collections, sources });

  // Precondition: the scenario is valid.
  expect(analysis.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

  return analysis.entries.map((descriptor) => ({ descriptor, terms: TERMS[descriptor.sourcePath] ?? {} }));
};

describe('termPagesOf', () => {
  it('mounts a page per referenced term, in each locale where an entry references it, from every collection', () => {
    const found = termPagesOf({ locales, collections, taxonomies, entries: kept() });

    expect(found.map((page) => `${page.locale} ${page.term} ${page.url}`)).toEqual([
      'fr arnaud /authors/arnaud',
      'fr gustave /authors/gustave',
      'en gustave /en/authors/gustave',
    ]);
    expect(found[0]).toEqual({
      taxonomy: 'authors',
      term: 'arnaud',
      locale: 'fr',
      route: '/authors/arnaud',
      url: '/authors/arnaud',
      page: 1,
      pages: 1,
      first: '/authors/arnaud',
    });
    expect(Object.isFrozen(found)).toBe(true);
  });

  it('mounts a term page once per slice of its entries, by its page size, its first page at its own URL', () => {
    const paged = {
      authors: defineTaxonomy(['gustave', 'arnaud', 'nadia'], { pages: { base: 'authors', perPage: 1 } }),
      tags,
    };
    const found = termPagesOf({ locales, collections, taxonomies: paged, entries: kept() });

    // Two entries for each author in French (an entry naming both counts once for each), one for gustave in English.
    expect(found.map((page) => `${page.url} ${String(page.page)}/${String(page.pages)} ${page.first}`)).toEqual([
      '/authors/arnaud 1/2 /authors/arnaud',
      '/authors/arnaud/page/2 2/2 /authors/arnaud',
      '/authors/gustave 1/2 /authors/gustave',
      '/authors/gustave/page/2 2/2 /authors/gustave',
      '/en/authors/gustave 1/1 /en/authors/gustave',
    ]);
    expect(found[1]?.route).toBe('/authors/arnaud/page/2');
  });

  it('never mounts a term without an entry, nor through a reserved one, nor a taxonomy without pages', () => {
    const found = termPagesOf({ locales, collections, taxonomies, entries: kept() });

    expect(found.some((page) => page.term === 'nadia')).toBe(false);
    expect(found.some((page) => page.taxonomy === 'tags')).toBe(false);
  });

  it('follows the URL strategy: every locale prefixed when explicit', () => {
    const urls = createUrlBuilder(locales, { defaultLocale: 'explicit' });
    const found = termPagesOf({ locales, collections, taxonomies, urls, entries: kept() });

    expect(found.map((page) => page.url)).toContain('/fr/authors/gustave');
  });
});

describe('termPageCollisions', () => {
  it('reports a term page at an entry’s URL, and at a folder page’s', () => {
    const urls = createUrlBuilder(locales);
    const withAuthors = { ...collections, pages: defineCollection({ ...pages, references: { authors: 'authors' } }) };
    const sources = [...src('blog', 'news/bot/post-01.mdx'), ...src('pages', 'authors/gustave.mdx')];
    const analysis = analyze({ locales, collections: withAuthors, sources });
    const entries = analysis.entries.map((descriptor) => ({ descriptor, terms: { authors: ['gustave'] } }));
    const found = termPagesOf({ locales, collections: withAuthors, taxonomies, urls, entries });
    const collisions = termPageCollisions(found, entries, [], urls);

    expect(collisions.map((d) => [d.code, d.collection, d.sourcePath, d.data.url])).toEqual([
      ['term-page-collision', 'pages', 'authors/gustave.mdx', '/authors/gustave'],
    ]);
    const blogAtAuthors = defineCollection({ ...blog, base: 'authors', folderPages: { levels: ['category'] } });
    const folders = folderPagesOf({
      locales,
      collections: { blog: blogAtAuthors },
      urls,
      entries: analyze({ locales, collections: { blog: blogAtAuthors }, sources: src('blog', 'gustave/x/a.mdx') })
        .entries,
    });

    expect(termPageCollisions(found, [], folders, urls).map((d) => [d.collection, d.sourcePath])).toEqual([
      ['blog', null],
    ]);
  });
});

describe('defineTaxonomy: pages', () => {
  it('keeps the base, and none by default', () => {
    expect(authors.pages).toEqual({ base: 'authors' });
    expect(tags.pages).toBeNull();
  });

  it('keeps the page size, when declared', () => {
    expect(defineTaxonomy(['gustave'], { pages: { base: 'authors', perPage: 10 } }).pages).toEqual({
      base: 'authors',
      perPage: 10,
    });
  });

  it.each<[string, unknown, readonly string[]]>([
    ['an invalid base', { base: 'Authors' }, ['gustave']],
    ['an empty base', { base: '' }, ['gustave']],
    ['a term that is not a URL segment', { base: 'authors' }, ['Gustave Eiffel']],
    ['a page size of 0', { base: 'authors', perPage: 0 }, ['gustave']],
    ['a fractional page size', { base: 'authors', perPage: 1.5 }, ['gustave']],
    ['a page size that is not a number', { base: 'authors', perPage: '3' }, ['gustave']],
  ])('throws InvalidTaxonomyError on %s', (_, pagesOption, terms) => {
    expect(() =>
      // @ts-expect-error -- an untyped (JS or JSON) caller: validated at runtime.
      defineTaxonomy(terms, { pages: pagesOption }),
    ).toThrow(InvalidTaxonomyError);
  });

  it('suggests the URL segment a term could be', () => {
    expect(() => defineTaxonomy(['Gustave Eiffel'], { pages: { base: 'authors' } })).toThrow(/gustave-eiffel/);
  });
});

describe('defineConfig: a taxonomy with pages', () => {
  const source: ContentSource = {
    directories: () => Promise.resolve({}),
    async *documents() {
      yield* [];
      await Promise.resolve();
    },
  };

  it('cannot share its name with a collection: a mounted URL names one or the other', () => {
    expect(() => defineConfig({ locales, collections: { authors: pages }, taxonomies: { authors }, source })).toThrow(
      InvalidConfigError,
    );
    expect(() =>
      defineConfig({ locales, collections: { authors: pages }, taxonomies: { authors: tags }, source }),
    ).not.toThrow();
  });
});
