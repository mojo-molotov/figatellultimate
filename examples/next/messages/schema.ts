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
    toc: { title: _ },
    code: { copy: _, copied: _, tabs: _ },
    image: { open: _, close: _ },
    card: { tags: _, authors: _ },
    navbar: { nav: _, menu: _ },
    locales: { language: _ },
    theme: { dark: _, site: _, maquis: _, paper: _ },
    footer: { nav: _, made: _, love: _ },
    pager: { nav: _, previous: _, next: _ },
    feed: { title: _, description: _ },
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
      sort: { trigger: _, relevance: _, 'title-asc': _, 'title-desc': _, 'date-desc': _, 'date-asc': _ },
    },
    facets: {
      tags: { trigger: _, filter: _, list: _, empty: _, clear: _ },
      authors: { trigger: _, filter: _, list: _, empty: _, clear: _ },
    },
    reset: _,
    sort: { trigger: _, 'date-desc': _, 'date-asc': _, 'title-asc': _, 'title-desc': _ },
    listing: { total: _ },
    pagination: { nav: _, previous: _, next: _, page: _, current: _, more: _, jump: _, short: _ },
  },
} as const satisfies MessageSchema;

/** What every locale writes, the default one included: the schema's keys, a text for each hole. */
export type AppMessages = MessagesOf<typeof schema>;
