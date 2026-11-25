import { describe, expect, it } from 'vitest';

import { blog, landingPages, locales, pages } from '../../__tests__/scenarios/collections.js';
import { defineCollection } from '../../declarations/collection.js';
import { defineTaxonomy } from '../../declarations/taxonomy.js';
import { analyze, type SourceInput } from '../../paths/analyze.js';
import { folderPagesOf } from '../../paths/folders.js';
import { createUrlBuilder } from '../../paths/url.js';
import type { Collection } from '../../declarations/collection.js';
import { routeShadowings, routesOf } from '../routes.js';
import { termPagesOf } from '../term-pages.js';

const authors = defineTaxonomy(['gustave'], { pages: { base: 'authors' } });
const tags = defineTaxonomy(['bot']);
const unmounted = defineCollection({ ...pages, entry: 'authorBio', mounted: false });
// The blog's posts reference their authors: each author has a term page.
const posts = defineCollection({ ...blog, references: { authors: 'authors' } });

const src = (collection: string, ...paths: string[]): SourceInput[] =>
  paths.map((sourcePath) => ({ collection, sourcePath }));

/** The shadowings of a content: its entries analyzed, its folder and term pages mounted as the build mounts them. */
function shadowings(collections: Readonly<Record<string, Collection>>, sources: readonly SourceInput[]) {
  const urls = createUrlBuilder(locales);
  const analysis = analyze({ locales, collections, sources });
  const taxonomies = { authors, tags };

  // Precondition: the content is valid, every entry mounted; only the routes may clash.
  expect(analysis.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  expect(analysis.entries.length).toBe(sources.length);

  const entries = analysis.entries.map((descriptor) => ({
    descriptor,
    terms: descriptor.collection === 'blog' ? { authors: ['gustave'] } : {},
  }));

  return routeShadowings({
    collections,
    taxonomies,
    entries: analysis.entries,
    folders: folderPagesOf({ locales, collections, urls, entries: analysis.entries }),
    terms: termPagesOf({ locales, collections, taxonomies, urls, entries }),
    urls,
  });
}

describe('routesOf', () => {
  it('gives one route per base, the collections and the taxonomies it serves, unmounted ones left out', () => {
    expect(
      routesOf({ pages, blog, landingPages, authorBios: unmounted }, { authors, tags: defineTaxonomy(['bot']) }),
    ).toEqual([
      { base: '', collections: ['pages'], taxonomies: [] },
      { base: 'authors', collections: [], taxonomies: ['authors'] },
      { base: 'blog', collections: ['blog'], taxonomies: [] },
      { base: 'lp', collections: ['landingPages'], taxonomies: [] },
    ]);
  });

  it('serves two collections sharing a base from one route', () => {
    const notes = defineCollection({ ...landingPages, entry: 'note', base: 'blog' });

    expect(routesOf({ blog, notes }, {})).toEqual([{ base: 'blog', collections: ['blog', 'notes'], taxonomies: [] }]);
  });
});

describe('routeShadowings', () => {
  it('finds nothing while every page sits under its own route, a reserved entry left to its dedicated route', () => {
    expect(
      shadowings({ pages, blog: posts, landingPages }, [
        ...src('pages', 'docs/setup.mdx', 'en/docs/setup.mdx', 'lp/sign-up.mdx', 'blogging.mdx'),
        ...src('blog', 'news/bot/post.mdx'),
        ...src('landingPages', 'spring/sale.mdx'),
      ]),
    ).toEqual([]);
  });

  it("reports a page under another route's prefix, in every locale, whatever kind it is", () => {
    // `/blog/news` is the blog's prefix and more: a collection based there takes the blog's news category over.
    const news = defineCollection({ ...landingPages, entry: 'newsPage', base: 'blog/news' });
    const found = shadowings(
      { pages, blog: defineCollection({ ...posts, folderPages: { levels: ['category'] } }), news },
      [...src('pages', 'blog/about.mdx', 'en/blog/about.mdx'), ...src('blog', 'news/bot/post.mdx')],
    );

    expect(found.map((d) => [d.collection, d.sourcePath, d.data])).toEqual([
      ['blog', 'news/bot/post.mdx', { url: '/blog/news/bot/post', route: 'blog', shadowedBy: 'blog/news' }],
      ['pages', 'en/blog/about.mdx', { url: '/en/blog/about', route: '', shadowedBy: 'blog' }],
      ['pages', 'blog/about.mdx', { url: '/blog/about', route: '', shadowedBy: 'blog' }],
      // The category's folder page: no file of its own.
      ['blog', null, { url: '/blog/news', route: 'blog', shadowedBy: 'blog/news' }],
    ]);
  });

  it("reports a term page under a collection's prefix", () => {
    const people = defineCollection({ ...landingPages, entry: 'person', base: 'authors/gustave' });

    expect(
      shadowings({ blog: posts, people }, src('blog', 'news/bot/post.mdx')).map((d) => [
        d.collection,
        d.sourcePath,
        d.data,
      ]),
    ).toEqual([['authors', null, { url: '/authors/gustave', route: 'authors', shadowedBy: 'authors/gustave' }]]);
  });
});
