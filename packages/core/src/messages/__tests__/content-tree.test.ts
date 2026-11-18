import { describe, expect, it } from 'vitest';

import { defineCollection } from '../../declarations/collection.js';
import { locale, rest, segment, slug } from '../../declarations/grammar.js';
import { defineLocales } from '../../declarations/locales.js';
import { defineTaxonomy } from '../../declarations/taxonomy.js';
import { analyze } from '../../paths/analyze.js';
import { contentMessageTree, type MessageTree } from '../content-tree.js';

const locales = defineLocales({ list: ['fr', 'en'], default: 'fr' });
const blog = defineCollection({
  entry: 'blogPost',
  base: 'blog',
  grammar: [segment('category'), segment('subcategory'), locale({ optional: true }), slug()],
  messages: { category: ['title', 'meta-description'], subcategory: ['title'] },
});
const pages = defineCollection({
  entry: 'page',
  base: '',
  grammar: [locale({ optional: true }), rest('path'), slug()],
  messages: { path: ['title'] },
});

/** Descriptors of the given paths, through the real parser (the tree is derived from structure only). */
function tree(
  collections: Parameters<typeof contentMessageTree>[0]['collections'],
  sources: Readonly<Record<string, readonly string[]>>,
  taxonomies: Parameters<typeof contentMessageTree>[0]['taxonomies'] = {},
): MessageTree {
  const { entries, diagnostics } = analyze({
    locales,
    collections,
    sources: Object.entries(sources).flatMap(([collection, paths]) =>
      paths.map((sourcePath) => ({ collection, sourcePath })),
    ),
  });

  // Precondition: the scenario only holds valid paths, so the tree sees every one of them.
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

  return contentMessageTree({ collections, taxonomies, entries });
}

describe('contentMessageTree', () => {
  it('nests segment values in grammar order, with their own fields under `$`', () => {
    const result = tree(
      { blog },
      {
        blog: [
          'patch-notes/bot/post-02.mdx',
          'patch-notes/dashboard/en/post-01.mdx',
          'patch-notes/dashboard/post-01.mdx',
          'tutorials/getting-started/first-steps.mdx',
        ],
      },
    );

    expect(result.content).toEqual({
      blog: {
        fields: [],
        children: {
          'patch-notes': {
            fields: ['title', 'meta-description'],
            children: {
              bot: { fields: ['title'], children: {} },
              dashboard: { fields: ['title'], children: {} },
            },
          },
          tutorials: {
            fields: ['title', 'meta-description'],
            children: { 'getting-started': { fields: ['title'], children: {} } },
          },
        },
      },
    });
    expect(Object.isFrozen(result.content['blog']?.children['patch-notes'])).toBe(true);
  });

  it('a category and a subcategory with the same name never share a key', () => {
    const result = tree({ blog }, { blog: ['news/news/a.mdx', 'news/other/b.mdx'] });
    const news = result.content['blog']?.children['news'];

    expect(news?.fields).toEqual(['title', 'meta-description']);
    expect(news?.children['news']?.fields).toEqual(['title']);
  });

  it('turns every folder of a rest segment into a nested level, and root-level pages into nothing', () => {
    const result = tree(
      { pages },
      {
        pages: ['index.mdx', 'about.mdx', 'docs/index.mdx', 'docs/guides/setup.mdx', 'en/docs/guides/setup.mdx'],
      },
    );

    expect(result.content).toEqual({
      pages: {
        fields: [],
        children: {
          docs: { fields: ['title'], children: { guides: { fields: ['title'], children: {} } } },
        },
      },
    });
  });

  it('keeps a level without fields when only a deeper segment declares some', () => {
    const subOnly = defineCollection({ ...blog, messages: { subcategory: ['title'] } });
    const result = tree({ blog: subOnly }, { blog: ['patch-notes/bot/post.mdx'] });

    expect(result.content['blog']?.children['patch-notes']).toEqual({
      fields: [],
      children: { bot: { fields: ['title'], children: {} } },
    });
  });

  it('stops after the last segment with fields, and adds nothing for collections without messages', () => {
    const categoryOnly = defineCollection({ ...blog, messages: { category: ['title'] } });
    const plain = defineCollection({ ...pages, messages: {} });
    const result = tree(
      { blog: categoryOnly, pages: plain },
      { blog: ['patch-notes/bot/post.mdx'], pages: ['docs/a.mdx'] },
    );

    expect(result.content).toEqual({
      blog: { fields: [], children: { 'patch-notes': { fields: ['title'], children: {} } } },
    });
  });

  it('requires the declared fields of every taxonomy term, and nothing for taxonomies without messages', () => {
    const result = tree(
      { blog },
      { blog: ['patch-notes/bot/post.mdx'] },
      {
        tags: defineTaxonomy(['release', 'bot'], { messages: ['label'] }),
        plain: defineTaxonomy(['x']),
      },
    );

    expect(result.taxonomies).toEqual({ tags: { bot: ['label'], release: ['label'] } });
  });

  it('is independent of the input order (deterministic keys)', () => {
    const paths = ['tutorials/getting-started/a.mdx', 'patch-notes/bot/b.mdx', 'patch-notes/dashboard/c.mdx'];
    const forward = tree({ blog }, { blog: paths });
    const backward = tree({ blog }, { blog: [...paths].reverse() });

    expect(JSON.stringify(backward)).toBe(JSON.stringify(forward));
  });
});
