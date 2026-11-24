// The English messages, written against the schema.
import type { AppMessages } from './schema.ts';

// Values used in more than one place, written once (`SHARED`).
const SHARED = { blog: 'Blog' } as const;

const nav = { blog: SHARED.blog } as const satisfies AppMessages['nav'];

// From figatellultimate's skeleton: a new folder or term breaks this section until it is translated.
const content = {
  pages: { docs: { $: { title: 'Documentation' } } },
  blog: {
    $: {
      description:
        'News from the Empire of Igoristan, from its decrees to its islands, from its academy to the maquis.',
    },
    court: {
      $: {
        title: 'The imperial court',
        description: 'The court’s etiquette and banquets, where they toast the green build.',
      },
      etiquette: {
        $: {
          title: 'Etiquette',
          description: 'How to address linters, bow to a green build and take a seat at the commit table.',
        },
      },
      banquets: {
        $: {
          title: 'Banquets',
          description: 'A hundred figatelli, a vintage kvass and a toast raised to the cache, served in production.',
        },
      },
    },
    islands: {
      $: { title: 'The islands', description: 'Elba, Sardinia and everything afloat around the Empire.' },
      elba: {
        $: {
          title: 'Elba',
          description:
            'The exile of the staging server, the lighthouse of Portoferraio and the true origin of Elba errors.',
        },
      },
      sardinia: {
        $: {
          title: 'Sardinia',
          description:
            'The neighbours who deploy on Fridays, the undersea cable to Bonifacio and the treaty of brocciu.',
        },
      },
    },
    academy: {
      $: {
        title: 'The Academy',
        description: 'Where TypeScript and linting are taught, a rule written, then checked.',
      },
      typescript: {
        $: {
          title: 'TypeScript',
          description: 'Strict types, generics and discriminated unions, all the way to the diploma of banned any.',
        },
      },
      linting: {
        $: { title: 'The art of linting', description: 'Sorted imports, airy lines and the zero-warning contest.' },
      },
    },
    empire: {
      $: {
        title: 'The Empire',
        description: 'The decrees and chronicles of the Empire of Igoristan, carved, then versioned.',
      },
      decrees: {
        $: {
          title: 'Imperial decrees',
          description:
            'The Emperor’s decrees, circulars and ordinances, from mandatory figatellu to the two o’clock nap.',
        },
      },
      chronicles: {
        $: {
          title: 'Chronicles',
          description: 'The days that marked the Empire, told by their eyewitnesses and kept by posterity.',
        },
      },
      firewall: {
        $: {
          title: 'Imperial Firewall',
          description: 'Blurry selfies turned back at the border and npm packages from the mainland.',
        },
      },
      tribunal: {
        $: {
          title: 'The linter’s court',
          description: 'The trials of the missing semicolon, of implicit any and of tabs.',
        },
      },
      harbour: {
        $: {
          title: 'Harbour affairs',
          description:
            'The customs of circular imports, ferries loaded with dependencies and the lighthouse turned server.',
        },
      },
      diplomacy: {
        $: { title: 'Diplomacy', description: 'Peace treaties with the browsers and the summit of time zones.' },
      },
      archives: {
        $: {
          title: 'Imperial archives',
          description: 'The Empire’s first commit, the lost map of the maquis and Saint Igor’s floppy disk.',
        },
      },
      ceremonies: {
        $: {
          title: 'Ceremonies',
          description:
            'The coronation of the green build, the blessing of branches and the parade of regression tests.',
        },
      },
    },
    maquis: {
      $: {
        title: 'The maquis',
        description: 'The Corsicamons and the island’s cooking, between two glasses of kvass.',
      },
      corsicamon: {
        $: {
          title: 'Corsicamon',
          description:
            'The Corsicadex, each Corsicamon’s strengths and weaknesses, and how to catch it without spilling your kvass.',
        },
      },
      kitchen: {
        $: {
          title: 'Imperial kitchen',
          description: 'The island’s imperial recipes, from brocciu to figatellu, served in production.',
        },
      },
      donkeys: {
        $: {
          title: 'The donkeys',
          description: 'The donkeys of the maquis, who review pull requests and keep their Friday serenity.',
        },
      },
      'chestnut-grove': {
        $: {
          title: 'The chestnut grove',
          description: 'Chestnuts compiled by hand and the tree of a thousand git branches.',
        },
      },
      shepherds: {
        $: { title: 'Shepherds', description: 'Shepherds who count in binary and the transhumance of servers.' },
      },
      vigils: {
        $: {
          title: 'Evening gatherings',
          description: 'Evening tales, from the eternal loader to the invalidated cache.',
        },
      },
      tramontane: {
        $: {
          title: 'The tramontane',
          description: 'The wind that blows tests away, the cache too, and the weather of builds.',
        },
      },
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
  toc: { title: 'On this page', toggle: 'Contents' },
  code: { copy: 'Copy the code', copied: 'Code copied', tabs: 'Package manager' },
  image: { open: 'Enlarge the image: {alt}', close: 'Close the image' },
  card: { tags: 'Tags', authors: 'Authors', more: 'More tags' },
  navbar: { nav: 'Main navigation', menu: 'Menu' },
  locales: { language: 'Language:' },
  theme: {
    toggle: {
      light: 'Light theme, switch to the dark theme',
      dark: 'Dark theme, switch to the light theme',
      unknown: 'Switch the theme',
    },
    pick: { on: '{name} theme, current theme', choose: 'Switch to the {name} theme', unknown: '{name} theme' },
    site: 'Site theme',
    maquis: 'Maquis',
    paper: 'Paper',
  },
  footer: { nav: 'Site map', made: 'Made with', love: 'love' },
  pager: { nav: 'Previous and next pages', previous: 'Previous', next: 'Next' },
  notFound: {
    title: 'Page not found',
    text: 'This page does not exist, or no longer does: it may have moved.',
    home: 'Back to the home page',
  },
  feed: { title: 'The Figatellultimate blog', description: 'News from the Empire of Igoristan.' },
  collections: { pages: 'Pages', blog: SHARED.blog },
  search: {
    trigger: 'Search',
    shortcut: { mac: '⌘K', other: 'Ctrl K' },
    title: 'Search the site',
    close: 'Close the search',
    input: 'Search the site',
    placeholder: 'Search…',
    results: 'Results',
    more: 'See more',
    pause: ', ',
    tooShort: 'Type at least {minimum} characters.',
    searching: 'Searching…',
    unavailable: 'Search is unavailable (run figatellultimate search after the build).',
    found: '{count, plural, =0 {No result} one {# result} other {# results}}',
    sort: { trigger: 'Sort results', relevance: 'Relevance' },
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
    unit: '{count, plural, one {post} other {posts}}',
  },
  listing: { total: '{count, plural, =0 {No posts} one {# post} other {# posts}}' },
  reset: 'Reset filters',
  options: {
    trigger:
      '{count, plural, =0 {Filters and sort} one {Filters and sort, # filter on} other {Filters and sort, # filters on}}',
    content: 'Filters and sort',
  },
  sort: {
    trigger: 'Sort posts',
    'date-desc': 'Newest',
    'date-asc': 'Oldest',
    'title-asc': 'A → Z',
    'title-desc': 'Z → A',
    spoken: { 'title-asc': 'Alphabetical order', 'title-desc': 'Reverse alphabetical order' },
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
    spoken: 'Page {page} of {pages}',
  },
} as const satisfies AppMessages['ui'];

// The whole locale, composed from its sections and locked by the schema: a missing or extra key does not compile.
const en = { nav, content, taxonomies, ui } as const satisfies AppMessages;

export default en;
