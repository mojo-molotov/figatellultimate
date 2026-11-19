import { defineLocales } from '@figatellultimate/core';
import { describe, expect, it } from 'vitest';

import { analyzeMessages, findUnusedMessages, referenceKeys } from '../index.js';

const locales = defineLocales({ list: ['fr', 'en'], default: 'fr' });

const reference = {
  content: { blog: { news: { $: { title: 'Nouvelles' } } } },
  taxonomies: { tags: { bot: { label: 'Robot' } } },
  nav: { blog: 'Blog' },
  ui: {
    title: 'Titre',
    sort: { asc: 'Croissant', desc: 'Décroissant' },
    legacy: { a: 'Ancien A', b: 'Ancien B' },
    dead: 'Mort',
  },
};

const { model } = analyzeMessages({
  locales,
  tree: {
    content: { blog: { fields: [], children: { news: { fields: ['title'], children: {} } } } },
    taxonomies: { tags: { bot: ['label'] } },
  },
  modules: { 'fr.ts': reference, 'en.ts': reference },
});

/** The keys reported as unused. */
const unused = (input: { used?: string[]; kept?: string[]; navigation?: { label: string }[] }): (string | null)[] =>
  findUnusedMessages({
    model,
    defaultLocale: 'fr',
    used: new Set(input.used ?? []),
    kept: input.kept ?? [],
    navigation: (input.navigation ?? []).map((item) => ({ collection: 'blog', depth: 1, ...item })),
  }).map((d) => d.key);

describe('referenceKeys', () => {
  it("lists every message of the reference, the content's included, as dot paths", () => {
    expect(referenceKeys(model)).toEqual([
      'content.blog.news.$.title',
      'taxonomies.tags.bot.label',
      'nav.blog',
      'ui.title',
      'ui.sort.asc',
      'ui.sort.desc',
      'ui.legacy.a',
      'ui.legacy.b',
      'ui.dead',
    ]);
  });
});

describe('findUnusedMessages', () => {
  it("reports each app message nothing uses, never the content's nor the taxonomies'", () => {
    expect(unused({})).toEqual([
      'nav.blog',
      'ui.dead',
      'ui.legacy.a',
      'ui.legacy.b',
      'ui.sort.asc',
      'ui.sort.desc',
      'ui.title',
    ]);
  });

  it.each<[string, Parameters<typeof unused>[0], string[]]>([
    [
      'the used ones',
      { used: ['ui.title', 'ui.sort.asc'] },
      ['nav.blog', 'ui.dead', 'ui.legacy.a', 'ui.legacy.b', 'ui.sort.desc'],
    ],
    [
      'a kept message',
      { kept: ['ui.dead'] },
      ['nav.blog', 'ui.legacy.a', 'ui.legacy.b', 'ui.sort.asc', 'ui.sort.desc', 'ui.title'],
    ],
    [
      'every message of a kept group',
      { kept: ['ui.legacy'] },
      ['nav.blog', 'ui.dead', 'ui.sort.asc', 'ui.sort.desc', 'ui.title'],
    ],
    [
      "the navigation's labels",
      { navigation: [{ label: 'nav.blog' }] },
      ['ui.dead', 'ui.legacy.a', 'ui.legacy.b', 'ui.sort.asc', 'ui.sort.desc', 'ui.title'],
    ],
  ])('leaves out %s', (_, input, expected) => {
    expect(unused(input)).toEqual(expected);
  });

  it("locates each in the default locale's module, as a warning", () => {
    expect(
      findUnusedMessages({ model, defaultLocale: 'fr', used: new Set(), kept: ['ui', 'nav'], navigation: [] }),
    ).toEqual([]);
    expect(
      findUnusedMessages({ model, defaultLocale: 'fr', used: new Set(), kept: ['ui', 'nav.blo'], navigation: [] }),
    ).toEqual([
      {
        code: 'unused-message',
        severity: 'warning',
        file: 'fr.ts',
        key: 'nav.blog',
        data: { locale: 'fr' },
        suggestions: [],
      },
    ]);
  });
});
