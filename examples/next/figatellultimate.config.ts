/** The figatellultimate configuration: locales, collections, taxonomies, navigation and the content source. */
import { join } from 'node:path';

import { createContentCollectionsSource } from '@figatellultimate/content-collections';
import {
  defineCollection,
  defineConfig,
  defineLocales,
  defineTaxonomy,
  join as joinRoute,
  locale,
  rest,
  segment,
  slug,
} from '@figatellultimate/core';

// Three collections, by configuration only: no collection-specific code in figatellultimate.
// The SEO fields: a modification date, robots directives and a canonical override, per entry.
const metadata = {
  title: 'title',
  description: 'metadescription',
  image: 'featuredPictureUrl',
  modifiedTime: 'updated',
  robots: 'robots',
  canonical: 'canonical',
} as const;

export default defineConfig({
  locales: defineLocales({ list: { fr: { label: 'Français' }, en: { label: 'English' } }, default: 'fr' }),
  collections: {
    pages: defineCollection({
      entry: 'page',
      base: '',
      grammar: [locale({ optional: true }), rest('path'), slug()],
      messages: { path: ['title'] }, // folders are navbar sections
      draft: 'draft',
      // `order`: a documentation's reading order, in the navigation, its section's list and its previous and next links.
      metadata: { ...metadata, order: 'order' },
    }),
    blog: defineCollection({
      entry: 'blogPost',
      base: 'blog',
      grammar: [segment('category'), segment('subcategory'), locale({ optional: true }), slug()],
      indexForbiddenUnder: ['category', 'subcategory'],
      references: { tags: 'tags', authors: 'authors' },
      messages: { category: ['title', 'description'], subcategory: ['title'] },
      draft: 'draft',
      metadata: { ...metadata, publishedTime: 'date', tags: 'tags', type: 'article', schema: 'BlogPosting' },
      // The blog, category and subcategory pages, mounted like entries.
      // Each folder's image for its previews and Open Graph: declared, else its newest post's.
      folderPages: {
        root: true,
        levels: ['category', 'subcategory'],
        preview: 2,
        // A page at a time, each one prerendered with its slice (`/page/N`): categories, subcategories, posts.
        perPage: { root: 4, category: 2, subcategory: 5 },
        images: {
          academy: '/covers/placeholder-132.jpeg',
          court: '/covers/placeholder-81.jpeg',
          empire: '/covers/placeholder-14.jpeg',
          islands: '/covers/placeholder-108.jpeg',
          maquis: '/covers/placeholder-194.jpeg',
        },
      },
    }),
    landingPages: defineCollection({
      entry: 'landingPage',
      base: 'lp',
      grammar: [segment('category'), locale({ optional: true }), slug()],
      route: [joinRoute('-', 'category', 'slug')], // flat landing page URLs
      indexForbiddenAtRoot: true,
      searchable: false, // landing pages stay out of the search
      draft: 'draft',
      metadata,
    }),
    // Each author's long bio (`content/authors/<author>.mdx`), shown on their page: no page of its own.
    authorBios: defineCollection({
      entry: 'authorBio',
      base: '',
      grammar: [locale({ optional: true }), slug()],
      mounted: false,
      searchable: false,
    }),
  },
  taxonomies: {
    // Terms carry their names in the messages: adding a tag breaks every locale until it is translated.
    tags: defineTaxonomy(
      [
        'accordion',
        'bagpipes',
        'balalaika',
        'banjo',
        'bassoon',
        'cajon',
        'cello',
        'clarinet',
        'didgeridoo',
        'drums',
        'flute',
        'guitar',
        'harmonica',
        'harp',
        'harpsichord',
        'horn',
        'kalimba',
        'lute',
        'mandolin',
        'marimba',
        'oboe',
        'organ',
        'piano',
        'saxophone',
        'sitar',
        'theremin',
        'trombone',
        'trumpet',
        'tuba',
        'ukulele',
        'violin',
        'xylophone',
      ],
      { messages: ['label'] },
    ),
    // Authors carry data (pure data, never components) and a name and a short bio per locale; each has a page listing
    // their posts, in every locale where they wrote one, with their long bio when it is written (`authorBios`).
    authors: defineTaxonomy(
      { igor: { avatar: '/authors/igor.jpeg' }, napoleon: { avatar: '/authors/napoleon.jpeg' } },
      { messages: ['name', 'bio'], pages: { base: 'authors' }, content: 'authorBios' },
    ),
  },
  // The navbar, generated from the content: pages and one level of folders, then the blog's categories and
  // subcategories, linked to their listing pages.
  navigation: [
    // Pages' folders are links to their page (`/docs`), which lists them: no menu.
    { collection: 'pages', depth: 1, menus: false },
    // The blog, its categories and subcategories, each with its page: the breadcrumb follows every level; the
    // navbar's menus only list the categories (`menuDepth`).
    { collection: 'blog', depth: 2, label: 'nav.blog' },
  ],
  // Typed for `@figatellultimate/use-intl`: its precompiled messages type their ICU arguments by their keys.
  messages: { directory: 'messages', schema: 'schema.ts', runtime: 'use-intl' },
  source: createContentCollectionsSource({
    configPath: join(import.meta.dirname, 'content-collections.ts'),
    projectRoot: import.meta.dirname,
  }),
});
