// The English messages, written against the schema.
import type { AppMessages } from './schema.ts';

// Values used in more than one place, written once (`SHARED`).
const SHARED = { blog: 'Blog' } as const;

const nav = { blog: SHARED.blog } as const satisfies AppMessages['nav'];

// From figatellultimate's skeleton: a new folder or term breaks this section until it is translated.
const content = {
  pages: { docs: { $: { title: 'Documentation' } } },
  blog: {
    court: {
      $: {
        title: 'The imperial court',
        description: 'The court’s etiquette and banquets, where they toast the green build.',
      },
      etiquette: { $: { title: 'Etiquette' } },
      banquets: { $: { title: 'Banquets' } },
    },
    islands: {
      $: { title: 'The islands', description: 'Elba, Sardinia and everything afloat around the Empire.' },
      elba: { $: { title: 'Elba' } },
      sardinia: { $: { title: 'Sardinia' } },
    },
    academy: {
      $: {
        title: 'The Academy',
        description: 'Where TypeScript and linting are taught, a rule written, then checked.',
      },
      typescript: { $: { title: 'TypeScript' } },
      linting: { $: { title: 'The art of linting' } },
    },
    empire: {
      $: {
        title: 'The Empire',
        description: 'The decrees and chronicles of the Empire of Igoristan, carved, then versioned.',
      },
      decrees: { $: { title: 'Imperial decrees' } },
      chronicles: { $: { title: 'Chronicles' } },
      firewall: { $: { title: 'Imperial Firewall' } },
      tribunal: { $: { title: 'The linter’s court' } },
      harbour: { $: { title: 'Harbour affairs' } },
      diplomacy: { $: { title: 'Diplomacy' } },
      archives: { $: { title: 'Imperial archives' } },
      ceremonies: { $: { title: 'Ceremonies' } },
    },
    maquis: {
      $: {
        title: 'The maquis',
        description: 'The Corsicamons and the island’s cooking, between two glasses of kvass.',
      },
      corsicamon: { $: { title: 'Corsicamon' } },
      kitchen: { $: { title: 'Imperial kitchen' } },
      donkeys: { $: { title: 'The donkeys' } },
      'chestnut-grove': { $: { title: 'The chestnut grove' } },
      shepherds: { $: { title: 'Shepherds' } },
      vigils: { $: { title: 'Evening gatherings' } },
      tramontane: { $: { title: 'The tramontane' } },
    },
  },
} as const satisfies AppMessages['content'];

// From figatellultimate's skeleton: a new folder or term breaks this section until it is translated.
const taxonomies = {
  tags: {
    accordion: { label: 'Accordion' },
    bagpipes: { label: 'Bagpipes' },
    balalaika: { label: 'Balalaika' },
    banjo: { label: 'Banjo' },
    bassoon: { label: 'Bassoon' },
    cajon: { label: 'Cajón' },
    cello: { label: 'Cello' },
    clarinet: { label: 'Clarinet' },
    didgeridoo: { label: 'Didgeridoo' },
    drums: { label: 'Drums' },
    flute: { label: 'Flute' },
    guitar: { label: 'Guitar' },
    harmonica: { label: 'Harmonica' },
    harp: { label: 'Harp' },
    harpsichord: { label: 'Harpsichord' },
    horn: { label: 'Horn' },
    kalimba: { label: 'Kalimba' },
    lute: { label: 'Lute' },
    mandolin: { label: 'Mandolin' },
    marimba: { label: 'Marimba' },
    oboe: { label: 'Oboe' },
    organ: { label: 'Organ' },
    piano: { label: 'Piano' },
    saxophone: { label: 'Saxophone' },
    sitar: { label: 'Sitar' },
    theremin: { label: 'Theremin' },
    trombone: { label: 'Trombone' },
    trumpet: { label: 'Trumpet' },
    tuba: { label: 'Tuba' },
    ukulele: { label: 'Ukulele' },
    violin: { label: 'Violin' },
    xylophone: { label: 'Xylophone' },
  },
  authors: {
    igor: { name: 'Igor', bio: 'Rules Igoristan, the core and the codegen.' },
    napoleon: { name: 'Napoléon', bio: 'Imperial firewall of the guides and the design system.' },
  },
} as const satisfies AppMessages['taxonomies'];

const ui = {
  folder: { more: '{count, plural, one {See the post} other {See the # posts}}' },
  breadcrumb: { nav: 'Breadcrumb' },
  toc: { title: 'On this page' },
  code: { copy: 'Copy the code', copied: 'Code copied', tabs: 'Package manager' },
  image: { open: 'Enlarge the image: {alt}', close: 'Close the image' },
  card: { tags: 'Tags', authors: 'Authors' },
  navbar: { nav: 'Main navigation', menu: 'Menu' },
  locales: { language: 'Language:' },
  theme: { dark: 'Dark theme', site: 'Site theme', maquis: 'Maquis', paper: 'Paper' },
  footer: { nav: 'Site map', made: 'Made with', love: 'love' },
  pager: { nav: 'Previous and next pages', previous: 'Previous', next: 'Next' },
  feed: { title: 'The figatellultimate blog', description: 'News from the Empire of Igoristan.' },
  collections: { pages: 'Pages', blog: SHARED.blog },
  search: {
    trigger: 'Search',
    title: 'Search the site',
    close: 'Close the search',
    input: 'Search the site',
    placeholder: 'Search…',
    results: 'Results',
    more: 'See more',
    tooShort: 'Type at least {minimum} characters.',
    searching: 'Searching…',
    unavailable: 'Search is unavailable (run figatellultimate search after the build).',
    found: '{count, plural, =0 {No result} one {# result} other {# results}}',
    sort: {
      trigger: 'Sort results',
      relevance: 'Relevance',
      'title-asc': 'A → Z',
      'title-desc': 'Z → A',
      'date-desc': 'Newest',
      'date-asc': 'Oldest',
    },
  },
  facets: {
    tags: {
      trigger: '{count, plural, =0 {Tags} one {Tags (#)} other {Tags (#)}}',
      filter: 'Filter tags',
      list: 'Tags',
      empty: 'No tag',
      clear: 'Clear tags',
    },
    authors: {
      trigger: '{count, plural, =0 {Authors} one {Authors (#)} other {Authors (#)}}',
      filter: 'Filter authors',
      list: 'Authors',
      empty: 'No author',
      clear: 'Clear authors',
    },
  },
  listing: { total: '{count, plural, =0 {No posts} one {# post} other {# posts}}' },
  reset: 'Reset filters',
  sort: {
    trigger: 'Sort posts',
    'date-desc': 'Newest',
    'date-asc': 'Oldest',
    'title-asc': 'Title A–Z',
    'title-desc': 'Title Z–A',
  },
  pagination: {
    nav: 'Pagination',
    previous: 'Previous',
    next: 'Next',
    page: 'Page {page}',
    current: 'Page {page} of {pages}, current page',
    more: 'Pages {from} to {to}',
    jump: 'Go to page',
    short: '{page} / {pages}',
  },
} as const satisfies AppMessages['ui'];

// The whole locale, composed from its sections and locked by the schema: a missing or extra key does not compile.
const en = { nav, content, taxonomies, ui } as const satisfies AppMessages;

export default en;
