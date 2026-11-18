import {
  analyze,
  contentMessageTree,
  defineCollection,
  defineLocales,
  defineTaxonomy,
  locale,
  segment,
  slug,
  type MessageTree,
} from '@figatellu/core';
import { describe, expect, it } from 'vitest';

import { analyzeMessages } from '../analyze.js';
import type { MessageDiagnostic } from '../diagnostics.js';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** A nested group of a module, checked rather than cast: the tests edit it in place. */
function group(parent: unknown, ...path: readonly string[]): Record<string, unknown> {
  let node = parent;

  for (const key of path) node = isRecord(node) ? node[key] : undefined;

  if (!isRecord(node)) throw new Error(`No group at ${path.join('.')}`);

  return node;
}

const locales = defineLocales({ list: ['fr', 'en', 'ar'], default: 'fr' });
const blog = defineCollection({
  entry: 'blogPost',
  base: 'blog',
  grammar: [segment('category'), segment('subcategory'), locale({ optional: true }), slug()],
  messages: { category: ['title'], subcategory: ['title'] },
});

/** The required tree of a blog holding these paths, with a `tags` taxonomy needing a label. */
function treeOf(paths: readonly string[]): MessageTree {
  const { entries } = analyze({
    locales,
    collections: { blog },
    sources: paths.map((sourcePath) => ({ collection: 'blog', sourcePath })),
  });

  return contentMessageTree({
    collections: { blog },
    taxonomies: { tags: defineTaxonomy(['bot'], { messages: ['label'] }) },
    entries,
  });
}
const TREE = treeOf(['patch-notes/bot/post.mdx']);

/** A complete, valid module for the tree above, plus the app's own keys. */
const complete = (title: string, posts: string): Record<string, unknown> => ({
  content: { blog: { 'patch-notes': { $: { title }, bot: { $: { title: `${title} bot` } } } } },
  taxonomies: { tags: { bot: { label: 'Bot' } } },
  home: { posts, welcome: 'Hello {name}' },
});
const VALID = {
  'fr.ts': complete('Notes', '{count, plural, one {# billet} many {# billets} other {# billets}}'),
  'en.ts': complete('Patch notes', '{count, plural, one {# post} other {# posts}}'),
  'ar.ts': complete('ملاحظات', '{count, plural, zero {لا} one {#} two {#} few {#} many {#} other {#}}'),
};

const codes = (diagnostics: readonly MessageDiagnostic[]): string[] =>
  diagnostics.map((d) => `${d.file} ${d.key ?? '-'} ${d.code}`);

describe('analyzeMessages', () => {
  it('accepts complete modules and models the reference with its ICU arguments', () => {
    const { diagnostics, model } = analyzeMessages({ locales, tree: TREE, modules: VALID });

    expect(codes(diagnostics)).toEqual([]);
    expect(model.files).toEqual({ fr: 'fr.ts', en: 'en.ts', ar: 'ar.ts' });
    const home = model.reference.children['home'];

    expect(home).toEqual({
      kind: 'group',
      children: {
        posts: { kind: 'message', args: { count: { kind: 'number' } } },
        welcome: { kind: 'message', args: { name: { kind: 'text' } } },
      },
    });
  });

  it('adding a folder requires its key in every locale, the reference included', () => {
    const tree = treeOf(['patch-notes/bot/post.mdx', 'patch-notes/dashboard/post.mdx']);
    const { diagnostics } = analyzeMessages({ locales, tree, modules: VALID });

    expect(codes(diagnostics)).toEqual([
      'ar.ts content.blog.patch-notes.dashboard missing-message',
      'en.ts content.blog.patch-notes.dashboard missing-message',
      'fr.ts content.blog.patch-notes.dashboard missing-message',
    ]);
  });

  it('reports a key removed from one locale only, and nothing else (a no-op analysis cannot pass)', () => {
    const en = complete('Patch notes', '{count, plural, one {# post} other {# posts}}');

    delete group(en, 'home')['welcome'];
    const { diagnostics } = analyzeMessages({ locales, tree: TREE, modules: { ...VALID, 'en.ts': en } });

    expect(codes(diagnostics)).toEqual(['en.ts home.welcome missing-message']);
  });

  it('reports unknown keys against the reference or the content, with suggestions', () => {
    const en = complete('Patch notes', '{count, plural, one {# post} other {# posts}}');

    group(en, 'home')['welcom'] = 'typo';
    const fr = complete('Notes', '{count, plural, one {# billet} many {#} other {# billets}}');

    group(fr, 'content', 'blog')['patch-note'] = { $: { title: 'x' } };
    const { diagnostics } = analyzeMessages({ locales, tree: TREE, modules: { ...VALID, 'en.ts': en, 'fr.ts': fr } });

    expect(diagnostics.map((d) => [d.key, d.code, d.data, d.suggestions])).toEqual([
      ['home.welcom', 'unknown-message', { against: 'reference' }, ['home.welcome']],
      ['content.blog.patch-note', 'unknown-message', { against: 'content' }, ['content.blog.patch-notes']],
    ]);
  });

  it('checks the ICU syntax, the `other` clause and the arguments of every locale against the reference', () => {
    const en = complete('Patch notes', '{count, plural, one {# post}}');

    group(en, 'home')['welcome'] = 'Hello {firstName}';
    const ar = complete('ملاحظات', '{count, plural, other {#}');
    const { diagnostics } = analyzeMessages({ locales, tree: TREE, modules: { ...VALID, 'en.ts': en, 'ar.ts': ar } });

    expect(diagnostics.map((d) => [d.file, d.key, d.code, d.data])).toEqual([
      ['ar.ts', 'home.posts', 'invalid-message-syntax', { problem: 'EXPECT_ARGUMENT_CLOSING_BRACE', offset: 0 }],
      ['en.ts', 'home.posts', 'missing-plural-other', { argument: 'count' }],
      ['en.ts', 'home.welcome', 'message-arguments-mismatch', { expected: ['name: text'], found: ['firstName: text'] }],
    ]);
  });

  it('warns about plural categories a locale uses but a message lacks (exact `=n` selectors do not count)', () => {
    const fr = complete('Notes', '{count, plural, =0 {aucun} one {# billet} other {# billets}}');
    const ar = complete('ملاحظات', '{count, plural, one {#} other {#}}');
    const { diagnostics } = analyzeMessages({ locales, tree: TREE, modules: { ...VALID, 'fr.ts': fr, 'ar.ts': ar } });

    expect(diagnostics.map((d) => [d.file, d.code, d.severity, d.data])).toEqual([
      [
        'ar.ts',
        'missing-plural-category',
        'warning',
        { argument: 'count', categories: ['zero', 'two', 'few', 'many'] },
      ],
      ['fr.ts', 'missing-plural-category', 'warning', { argument: 'count', categories: ['many'] }],
    ]);
  });

  it('reports missing modules, modules of undeclared locales, and invalid values', () => {
    const { diagnostics } = analyzeMessages({
      locales,
      tree: TREE,
      modules: {
        'fr.ts': VALID['fr.ts'],
        'eng.ts': VALID['en.ts'],
        'ar.ts': { ...VALID['ar.ts'], home: { posts: 3, welcome: 'x {name}' } },
      },
    });

    expect(diagnostics.map((d) => [d.file, d.key, d.code, d.suggestions])).toEqual([
      ['ar.ts', 'home.posts', 'invalid-message-module', []],
      ['en.ts', null, 'missing-message-module', []],
      ['eng.ts', null, 'unknown-message-module', ['en']],
    ]);
  });

  it('falls back to the required tree as the reference when the default module is missing', () => {
    const { model, diagnostics } = analyzeMessages({
      locales,
      tree: TREE,
      modules: { 'en.ts': VALID['en.ts'], 'ar.ts': VALID['ar.ts'] },
    });

    expect(codes(diagnostics)).toEqual(['fr.ts - missing-message-module']);
    expect(Object.keys(model.reference.children)).toEqual(['content', 'taxonomies']);
  });

  it('types the arguments of select, date and nested arguments; a plural count reused as text stays a number', () => {
    const fr = complete('Notes', '{count, plural, one {# billet de {author}} other {{count} billets le {day, date}}}');

    group(fr, 'home')['welcome'] = '{gender, select, female {Elle} male {Il} other {On}} {name}';
    const en = complete(
      'Patch notes',
      '{count, plural, one {# post by {author}} other {{count} posts on {day, date}}}',
    );

    group(en, 'home')['welcome'] = '{gender, select, female {She} male {He} other {They}} {name}';
    const { model, diagnostics } = analyzeMessages({
      locales: defineLocales({ list: ['fr', 'en'], default: 'fr' }),
      tree: TREE,
      modules: { 'fr.ts': fr, 'en.ts': en },
    });

    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const home = model.reference.children['home'];

    expect(home?.kind === 'group' ? home.children : undefined).toEqual({
      posts: { kind: 'message', args: { count: { kind: 'number' }, author: { kind: 'text' }, day: { kind: 'date' } } },
      welcome: {
        kind: 'message',
        args: { gender: { kind: 'select', options: ['female', 'male'], open: true }, name: { kind: 'text' } },
      },
    });
  });
});
