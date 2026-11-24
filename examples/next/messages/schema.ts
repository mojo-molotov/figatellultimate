// The shape of every locale's messages, written once: figatellultimate's skeleton
// (`content` and `taxonomies`, derived from the content) spread first, then the app's own keys as holes.
// A new folder or taxonomy term enters through the skeleton: every locale stops compiling until it is translated.
import { skeleton, type MessageSchema, type MessagesOf } from '#figatellultimate/messages';

const _ = '';

export const schema = {
  ...skeleton,
  nav: { blog: _ },
  ui: {
    folder: { more: _ },
    breadcrumb: { nav: _ },
    // The table of contents' title, and its button's own name (an icon).
    toc: { title: _, toggle: _ },
    code: { copy: _, copied: _, tabs: _ },
    image: { open: _, close: _ },
    card: { tags: _, authors: _, more: _ },
    navbar: { nav: _, menu: _ },
    locales: { language: _ },
    // The site theme picker's options as spoken: as the light and dark toggle says its own (`toggle`).
    theme: {
      toggle: { light: _, dark: _, unknown: _ },
      pick: { on: _, choose: _, unknown: _ },
      site: _,
      maquis: _,
      paper: _,
    },
    footer: { nav: _, made: _, love: _ },
    pager: { nav: _, previous: _, next: _ },
    feed: { title: _, description: _ },
    notFound: { title: _, text: _, home: _ },
    collections: { pages: _, blog: _ },
    search: {
      trigger: _,
      title: _,
      close: _,
      input: _,
      placeholder: _,
      results: _,
      more: _,
      tooShort: _,
      searching: _,
      unavailable: _,
      found: _,
      // The other sorts' names are the listings' (`ui.sort`): one text, shown and read alike everywhere.
      sort: { trigger: _, relevance: _ },
    },
    facets: {
      tags: { trigger: _, filter: _, list: _, empty: _, clear: _ },
      authors: { trigger: _, filter: _, list: _, empty: _, clear: _ },
    },
    reset: _,
      // What a term's count counts, heard after it ("Harpe, 17 articles"), not seen.
      unit: _,
    options: { trigger: _, content: _ },
    // Each sort's name as shown, and, where it reads badly aloud (an arrow), as a screen reader says it.
    sort: {
      trigger: _,
      'date-desc': _,
      'date-asc': _,
      'title-asc': _,
      'title-desc': _,
      spoken: { 'title-asc': _, 'title-desc': _ },
    },
    listing: { total: _ },
    // `short`, the page select's text; `spoken`, the same as a screen reader says it (no slash read aloud).
    pagination: { nav: _, previous: _, next: _, page: _, current: _, more: _, jump: _, short: _, spoken: _ },
  },
} as const satisfies MessageSchema;

/** What every locale writes, the default one included: the schema's keys, a text for each hole. */
export type AppMessages = MessagesOf<typeof schema>;
