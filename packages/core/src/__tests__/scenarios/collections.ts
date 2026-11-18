// Shared test scenarios (not shipped): a site's three collections (pages, blog, landing pages), expressed by configuration only.
import { defineCollection, type Collection } from '../../declarations/collection.js';
import {
  join,
  locale,
  rest,
  segment,
  slug,
  type LocalePart,
  type RestPart,
  type SegmentPart,
  type SlugPart,
} from '../../declarations/grammar.js';
import { defineLocales, type Locales } from '../../declarations/locales.js';
import { defineTaxonomy, type Taxonomy } from '../../declarations/taxonomy.js';

export const locales: Locales<'fr' | 'en', 'fr'> = defineLocales({ list: ['fr', 'en'], default: 'fr' });

export const pages: Collection<'page', readonly [LocalePart, RestPart<'path'>, SlugPart]> = defineCollection({
  entry: 'page',
  base: '',
  grammar: [locale({ optional: true }), rest('path'), slug()],
  reserved: ['lp/sign-up'],
});

export const blog: Collection<
  'blogPost',
  readonly [SegmentPart<'category'>, SegmentPart<'subcategory'>, LocalePart, SlugPart]
> = defineCollection({
  entry: 'blogPost',
  base: 'blog',
  grammar: [segment('category'), segment('subcategory'), locale({ optional: true }), slug()],
  // No index file in the blog: the subcategory URL belongs to the app's listing page.
  indexForbiddenUnder: ['category', 'subcategory'],
  maxNameLength: 34,
});

export const landingPages: Collection<'landingPage', readonly [SegmentPart<'category'>, LocalePart, SlugPart]> =
  defineCollection({
    entry: 'landingPage',
    base: 'lp',
    grammar: [segment('category'), locale({ optional: true }), slug()],
    route: [join('-', 'category', 'slug')],
    indexForbiddenAtRoot: true,
    maxNameLength: 128,
  });

// The blog with its taxonomies, drafts and test content.
export const tags: Taxonomy<'bagpipes' | 'cello' | 'xylophone' | 'react', null> = defineTaxonomy([
  'bagpipes',
  'cello',
  'xylophone',
  'react',
]);
export const authors: Taxonomy<
  'Gustave' | 'Arnaud',
  Readonly<Record<'Gustave' | 'Arnaud', { avatar: string }>>
> = defineTaxonomy({ Gustave: { avatar: '/a/gustave.png' }, Arnaud: { avatar: '/a/arnaud.png' } });

export const blogWithContent: Collection<
  'blogPost',
  readonly [SegmentPart<'category'>, SegmentPart<'subcategory'>, LocalePart, SlugPart]
> = defineCollection({
  ...blog,
  references: { tags: 'tags', authors: 'authors' },
  draft: 'draft',
  testOnly: ['blog-testing-category/*'],
});
