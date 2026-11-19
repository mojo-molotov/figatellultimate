import {
  analyze,
  assemble,
  defineCollection,
  defineLocales,
  folderPagesOf,
  locale,
  rest,
  segment,
  slug,
  type Collection,
  type Entry,
  type NavigationItem,
} from '@figatellultimate/core';
import { describe, expect, it } from 'vitest';

import { navigationTrees, type NavigationNode } from '../navigation.js';

const locales = defineLocales({ list: ['fr', 'en'], default: 'fr' });
const collections: Readonly<Record<string, Collection>> = {
  pages: defineCollection({
    entry: 'page',
    base: '',
    grammar: [locale({ optional: true }), rest('path'), slug()],
    reserved: ['lp/sign-up'],
    messages: { path: ['title'] },
    metadata: { title: 'title' },
  }),
  blog: defineCollection({
    entry: 'blogPost',
    base: 'blog',
    grammar: [segment('category'), segment('subcategory'), locale({ optional: true }), slug()],
    messages: { category: ['title'], subcategory: ['title'] },
    metadata: { title: 'title' },
  }),
};

/** Paths with their French or English title (from the path's locale folder). */
const FILES: Readonly<Record<string, readonly string[]>> = {
  pages: [
    'index.mdx',
    'en/index.mdx',
    'about.mdx',
    'en/about.mdx',
    'zoo.mdx',
    'docs/index.mdx',
    'docs/setup.mdx',
    'en/docs/setup.mdx',
    'docs/deep/inner.mdx',
    'lp/sign-up.mdx',
  ],
  blog: ['news/bot/post-01.mdx', 'news/bot/en/post-01.mdx', 'news/site/post-02.mdx', 'guides/start/post-03.mdx'],
};

const titleOf = (path: string): string => {
  const name = path
    .replace(/\.mdx$/, '')
    .split('/')
    .filter((part) => part !== 'en')
    .join(' ');

  return path.split('/').includes('en') ? `EN ${name}` : `FR ${name}`;
};

function entries(): readonly Entry[] {
  const sources = Object.entries(FILES).flatMap(([collection, paths]) =>
    paths.map((sourcePath) => ({ collection, sourcePath })),
  );
  const analysis = analyze({ locales, collections, sources });
  const assembly = assemble({
    analysis,
    documents: sources.map((s) => ({ ...s, data: { title: titleOf(s.sourcePath) }, body: '' })),
    sourceDiagnostics: [],
    collections,
    taxonomies: {},
    environment: { drafts: 'include', testContent: 'include' },
  });

  // Precondition: the scenario is valid.
  expect(assembly.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

  return assembly.entries;
}

/** The navigation of one locale for a declaration; `blogPages` gives the blog folder pages. */
const tree = (
  navigation: readonly NavigationItem[],
  locale: 'fr' | 'en' = 'fr',
  blogPages?: { readonly root?: boolean; readonly levels: readonly ('category' | 'subcategory')[] },
): readonly NavigationNode[] => {
  const blog = collections['blog'];

  if (blog === undefined) throw new Error('no blog');

  const declared =
    blogPages === undefined
      ? collections
      : { ...collections, blog: defineCollection({ ...blog, folderPages: blogPages }) };
  const kept = entries();
  const folders = folderPagesOf({ locales, collections: declared, entries: kept.map((entry) => entry.descriptor) });

  return navigationTrees({ locales, collections: declared, navigation, entries: kept, folders })[locale] ?? [];
};

/** A compact picture: `title → url`, sections as `[label → url] { … }`. */
const picture = (nodes: readonly NavigationNode[]): unknown =>
  nodes.map((node) =>
    node.kind === 'entry'
      ? `${node.title} → ${node.url}`
      : { [`[${node.label}${node.url === undefined ? '' : ` → ${node.url}`}]`]: picture(node.children) },
  );

describe('navigationTrees', () => {
  it('lists root entries, home first, then sections for folders up to the depth', () => {
    expect(picture(tree([{ collection: 'pages', depth: 1 }], 'fr'))).toEqual([
      'FR index → /',
      'FR about → /about',
      'FR zoo → /zoo',
      // The folder links to its index entry; its own entries follow; deeper folders are beyond the depth.
      { '[content.pages.docs.$.title → /docs]': ['FR docs setup → /docs/setup'] },
    ]);
  });

  it("`menus: false` marks the collection's sections `menu: false`, and only them", () => {
    const nodes = tree([
      { collection: 'pages', depth: 2, menus: false },
      { collection: 'blog', depth: 2, label: 'nav.blog' },
    ]);
    const sections = (list: readonly NavigationNode[]): Extract<NavigationNode, { kind: 'section' }>[] =>
      list.flatMap((node) => (node.kind === 'section' ? [node, ...sections(node.children)] : []));
    const docs = sections(nodes).filter((node) => node.label.startsWith('content.pages.'));
    const blog = sections(nodes).filter((node) => !node.label.startsWith('content.pages.'));

    expect(docs.length).toBeGreaterThan(1);
    expect(blog.length).toBeGreaterThan(1);
    expect(docs.every((node) => node.menu === false)).toBe(true);
    expect(blog.every((node) => !('menu' in node))).toBe(true);
  });

  it('only shows what exists in the locale (no fallback), and never a reserved entry', () => {
    expect(picture(tree([{ collection: 'pages', depth: 1 }], 'en'))).toEqual([
      'EN index → /en',
      'EN about → /en/about',
      // No English docs index: the section has no link, but its English entry.
      { '[content.pages.docs.$.title]': ['EN docs setup → /en/docs/setup'] },
    ]);
    const deep: readonly NavigationItem[] = [{ collection: 'pages', depth: 2 }];

    expect(JSON.stringify([tree(deep, 'fr'), tree(deep, 'en')])).not.toContain('sign-up');
  });

  it('goes deeper with the depth: one section per level, labels along the message tree', () => {
    const fr = picture(tree([{ collection: 'pages', depth: 2 }], 'fr'));

    expect(fr).toContainEqual({
      '[content.pages.docs.$.title → /docs]': [
        'FR docs setup → /docs/setup',
        { '[content.pages.docs.deep.$.title]': ['FR docs deep inner → /docs/deep/inner'] },
      ],
    });
  });

  it('wraps a labelled collection in one section; folders with a page link it, their entries reached through it', () => {
    const blogNavigation: readonly NavigationItem[] = [{ collection: 'blog', depth: 2, label: 'nav.blog' }];
    const all = { root: true, levels: ['category', 'subcategory'] } as const;
    const fr = tree(blogNavigation, 'fr', all);
    const en = tree(blogNavigation, 'en', all);

    expect(picture(fr)).toEqual([
      {
        '[nav.blog → /blog]': [
          {
            '[content.blog.guides.$.title → /blog/guides]': [
              { '[content.blog.guides.start.$.title → /blog/guides/start]': [] },
            ],
          },
          {
            '[content.blog.news.$.title → /blog/news]': [
              { '[content.blog.news.bot.$.title → /blog/news/bot]': [] },
              { '[content.blog.news.site.$.title → /blog/news/site]': [] },
            ],
          },
        ],
      },
    ]);
    // English: only the folders holding English entries, with English URLs.
    expect(picture(en)).toEqual([
      {
        '[nav.blog → /en/blog]': [
          {
            '[content.blog.news.$.title → /en/blog/news]': [
              { '[content.blog.news.bot.$.title → /en/blog/news/bot]': [] },
            ],
          },
        ],
      },
    ]);
  });

  it('links only the folders whose level has a page', () => {
    const fr = tree([{ collection: 'blog', depth: 2, label: 'nav.blog' }], 'fr', { levels: ['subcategory'] });

    expect(picture(fr)).toEqual([
      {
        '[nav.blog]': [
          { '[content.blog.guides.$.title]': [{ '[content.blog.guides.start.$.title → /blog/guides/start]': [] }] },
          {
            '[content.blog.news.$.title]': [
              { '[content.blog.news.bot.$.title → /blog/news/bot]': [] },
              { '[content.blog.news.site.$.title → /blog/news/site]': [] },
            ],
          },
        ],
      },
    ]);
  });

  it('keeps the declared order of collections, and an unlabelled collection’s items at the top level', () => {
    const fr = tree([
      { collection: 'blog', depth: 1, label: 'nav.blog' },
      { collection: 'pages', depth: 0 },
    ]);

    expect(fr.map((node) => (node.kind === 'entry' ? node.url : node.label))).toEqual([
      'nav.blog',
      '/',
      '/about',
      '/zoo',
    ]);
  });

  it('sorts entries by title in the locale (localeCompare), the folder index first', () => {
    const fr = tree([{ collection: 'pages', depth: 0 }], 'fr');

    expect(fr.map((node) => node.kind === 'entry' && node.title)).toEqual(['FR index', 'FR about', 'FR zoo']);
  });

  it('orders siblings by their declared order, the unordered after by title, the folder index first', () => {
    const ordered = {
      pages: defineCollection({
        entry: 'page',
        base: '',
        grammar: [locale({ optional: true }), rest('path'), slug()],
        metadata: { title: 'title', order: 'order' },
      }),
    };
    // The declared order contradicts the titles' alphabetical one: a sort by title alone would fail.
    const files: readonly (readonly [string, string, number?])[] = [
      ['index.mdx', 'Home'],
      ['zeta.mdx', 'Zeta', 1],
      ['alpha.mdx', 'Alpha', 2],
      ['gamma.mdx', 'Gamma'],
      ['beta.mdx', 'Beta'],
    ];
    const sources = files.map(([sourcePath]) => ({ collection: 'pages', sourcePath }));
    const assembly = assemble({
      analysis: analyze({ locales, collections: ordered, sources }),
      documents: files.map(([sourcePath, title, order]) => ({
        collection: 'pages',
        sourcePath,
        data: order === undefined ? { title } : { title, order },
        body: '',
      })),
      sourceDiagnostics: [],
      collections: ordered,
      taxonomies: {},
      environment: { drafts: 'include', testContent: 'include' },
    });
    const nodes =
      navigationTrees({
        locales,
        collections: ordered,
        navigation: [{ collection: 'pages', depth: 0 }],
        entries: assembly.entries,
      })['fr'] ?? [];

    expect(nodes.map((node) => node.kind === 'entry' && node.title)).toEqual([
      'Home',
      'Zeta',
      'Alpha',
      'Beta',
      'Gamma',
    ]);
  });
});
