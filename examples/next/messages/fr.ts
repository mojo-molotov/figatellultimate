// The French messages, written against the schema and the reference for ICU arguments.
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
        title: 'La cour impériale',
        description: 'L’étiquette et les banquets de la cour, où l’on trinque au build vert.',
      },
      etiquette: { $: { title: 'Étiquette' } },
      banquets: { $: { title: 'Banquets' } },
    },
    islands: {
      $: { title: 'Les îles', description: 'Elbe, la Sardaigne et tout ce qui flotte autour de l’Empire.' },
      elba: { $: { title: 'Elbe' } },
      sardinia: { $: { title: 'Sardaigne' } },
    },
    academy: {
      $: { title: 'L’Académie', description: 'Où l’on apprend TypeScript et le lint, une règle écrite puis vérifiée.' },
      typescript: { $: { title: 'TypeScript' } },
      linting: { $: { title: 'L’art du lint' } },
    },
    empire: {
      $: {
        title: 'L’Empire',
        description: 'Les décrets et les chroniques de l’Empire d’Igoristan, gravés puis versionnés.',
      },
      decrees: { $: { title: 'Décrets impériaux' } },
      chronicles: { $: { title: 'Chroniques' } },
      firewall: { $: { title: 'Pare-feu impérial' } },
      tribunal: { $: { title: 'Tribunal du linter' } },
      harbour: { $: { title: 'Affaires portuaires' } },
      diplomacy: { $: { title: 'Diplomatie' } },
      archives: { $: { title: 'Archives impériales' } },
      ceremonies: { $: { title: 'Cérémonies' } },
    },
    maquis: {
      $: { title: 'Le maquis', description: 'Les Corsicamons et la cuisine de l’île, entre deux verres de kvas.' },
      corsicamon: { $: { title: 'Corsicamon' } },
      kitchen: { $: { title: 'Cuisine impériale' } },
      donkeys: { $: { title: 'Les ânes' } },
      'chestnut-grove': { $: { title: 'La châtaigneraie' } },
      shepherds: { $: { title: 'Bergers' } },
      vigils: { $: { title: 'Veillées' } },
      tramontane: { $: { title: 'La tramontane' } },
    },
  },
} as const satisfies AppMessages['content'];

// From figatellultimate's skeleton: a new folder or term breaks this section until it is translated.
const taxonomies = {
  tags: {
    accordion: { label: 'Accordéon' },
    bagpipes: { label: 'Cornemuse' },
    balalaika: { label: 'Balalaïka' },
    banjo: { label: 'Banjo' },
    bassoon: { label: 'Basson' },
    cajon: { label: 'Cajón' },
    cello: { label: 'Violoncelle' },
    clarinet: { label: 'Clarinette' },
    didgeridoo: { label: 'Didgeridoo' },
    drums: { label: 'Batterie' },
    flute: { label: 'Flûte' },
    guitar: { label: 'Guitare' },
    harmonica: { label: 'Harmonica' },
    harp: { label: 'Harpe' },
    harpsichord: { label: 'Clavecin' },
    horn: { label: 'Cor' },
    kalimba: { label: 'Kalimba' },
    lute: { label: 'Luth' },
    mandolin: { label: 'Mandoline' },
    marimba: { label: 'Marimba' },
    oboe: { label: 'Hautbois' },
    organ: { label: 'Orgue' },
    piano: { label: 'Piano' },
    saxophone: { label: 'Saxophone' },
    sitar: { label: 'Sitar' },
    theremin: { label: 'Thérémine' },
    trombone: { label: 'Trombone' },
    trumpet: { label: 'Trompette' },
    tuba: { label: 'Tuba' },
    ukulele: { label: 'Ukulélé' },
    violin: { label: 'Violon' },
    xylophone: { label: 'Xylophone' },
  },
  authors: {
    igor: { name: 'Igor', bio: 'Règne sur l’Igoristan, le cœur et la codegen.' },
    napoleon: { name: 'Napoléon', bio: 'Pare-feu impérial des guides et du design system.' },
  },
} as const satisfies AppMessages['taxonomies'];

const ui = {
  folder: {
    more: '{count, plural, one {Voir le billet} many {Voir les # billets} other {Voir les # billets}}',
  },
  breadcrumb: { nav: 'Fil d’Ariane' },
  toc: { title: 'Sur cette page' },
  code: { copy: 'Copier le code', copied: 'Code copié', tabs: 'Gestionnaire de paquets' },
  image: { open: 'Agrandir l’image : {alt}', close: 'Fermer l’image' },
  card: { tags: 'Tags', authors: 'Auteurs' },
  navbar: { nav: 'Navigation principale', menu: 'Menu' },
  locales: { language: 'Langue :' },
  theme: { dark: 'Thème sombre', site: 'Thème du site', maquis: 'Maquis', paper: 'Papier' },
  footer: { nav: 'Plan du site', made: 'Made with', love: 'amour' },
  pager: { nav: 'Pages précédente et suivante', previous: 'Précédent', next: 'Suivant' },
  feed: { title: 'Le blog de figatellultimate', description: 'Les nouvelles de l’Empire d’Igoristan.' },
  collections: { pages: 'Pages', blog: SHARED.blog },
  search: {
    trigger: 'Rechercher',
    title: 'Recherche sur le site',
    close: 'Fermer la recherche',
    input: 'Rechercher sur le site',
    placeholder: 'Rechercher…',
    results: 'Résultats',
    more: 'Voir plus',
    tooShort: 'Tapez au moins {minimum} caractères.',
    searching: 'Recherche…',
    unavailable: 'La recherche est indisponible (lancez figatellultimate search après le build).',
    found: '{count, plural, =0 {Aucun résultat} one {# résultat} many {# de résultats} other {# résultats}}',
    sort: {
      trigger: 'Trier les résultats',
      relevance: 'Pertinence',
      'title-asc': 'A → Z',
      'title-desc': 'Z → A',
      'date-desc': 'Plus récents',
      'date-asc': 'Plus anciens',
    },
  },
  facets: {
    tags: {
      trigger: '{count, plural, =0 {Tags} one {Tags (#)} many {Tags (#)} other {Tags (#)}}',
      filter: 'Filtrer les tags',
      list: 'Tags',
      empty: 'Aucun tag',
      clear: 'Réinitialiser les tags',
    },
    authors: {
      trigger: '{count, plural, =0 {Auteurs} one {Auteurs (#)} many {Auteurs (#)} other {Auteurs (#)}}',
      filter: 'Filtrer les auteurs',
      list: 'Auteurs',
      empty: 'Aucun auteur',
      clear: 'Réinitialiser les auteurs',
    },
  },
  listing: { total: '{count, plural, =0 {Aucun article} one {# article} many {# articles} other {# articles}}' },
  reset: 'Réinitialiser les filtres',
  sort: {
    trigger: 'Trier les articles',
    'date-desc': 'Plus récents',
    'date-asc': 'Plus anciens',
    'title-asc': 'Titre A–Z',
    'title-desc': 'Titre Z–A',
  },
  pagination: {
    nav: 'Pagination',
    previous: 'Précédente',
    next: 'Suivante',
    page: 'Page {page}',
    current: 'Page {page} sur {pages}, page actuelle',
    more: 'Pages {from} à {to}',
    jump: 'Aller à la page',
    short: '{page} / {pages}',
  },
} as const satisfies AppMessages['ui'];

// The whole locale, composed from its sections and locked by the schema: a missing or extra key does not compile.
const fr = { nav, content, taxonomies, ui } as const satisfies AppMessages;

export default fr;
