// The French messages, written against the schema and the reference for ICU arguments.
import type { AppMessages } from './schema.ts';

// Values used in more than one place, written once (`SHARED`).
const SHARED = { blog: 'Blog' } as const;

const nav = { blog: SHARED.blog } as const satisfies AppMessages['nav'];

// From figatellultimate's skeleton: a new folder or term breaks this section until it is translated.
const content = {
  pages: { docs: { $: { title: 'Documentation' } } },
  blog: {
    $: { description: 'Les nouvelles de l’Empire d’Igoristan, de ses décrets à ses îles, de son académie au maquis.' },
    court: {
      $: {
        title: 'La cour impériale',
        description: 'L’étiquette et les banquets de la cour, où l’on trinque au build vert.',
      },
      etiquette: {
        $: {
          title: 'Étiquette',
          description: 'Comment s’adresser aux linters, saluer un build vert et prendre place à la table des commits.',
        },
      },
      banquets: {
        $: {
          title: 'Banquets',
          description: 'Cent figatelli, un kvas millésimé et un toast levé au cache, servis en production.',
        },
      },
    },
    islands: {
      $: { title: 'Les îles', description: 'Elbe, la Sardaigne et tout ce qui flotte autour de l’Empire.' },
      elba: {
        $: {
          title: 'Elbe',
          description: 'L’exil du serveur de préproduction, le phare de Portoferraio et l’origine des erreurs d’Elbe.',
        },
      },
      sardinia: {
        $: {
          title: 'Sardaigne',
          description:
            'Les voisins qui déploient le vendredi, le câble sous-marin vers Bonifacio et le traité du brocciu.',
        },
      },
    },
    academy: {
      $: { title: 'L’Académie', description: 'Où l’on apprend TypeScript et le lint, une règle écrite puis vérifiée.' },
      typescript: {
        $: {
          title: 'TypeScript',
          description: 'Des types stricts, des génériques et des unions discriminées, jusqu’au diplôme sans any.',
        },
      },
      linting: {
        $: {
          title: 'L’art du lint',
          description: 'Les imports triés, les lignes aérées et le concours du zéro avertissement.',
        },
      },
    },
    empire: {
      $: {
        title: 'L’Empire',
        description: 'Les décrets et les chroniques de l’Empire d’Igoristan, gravés puis versionnés.',
      },
      decrees: {
        $: {
          title: 'Décrets impériaux',
          description:
            'Les décrets, circulaires et ordonnances de l’Empereur, du figatellu obligatoire à la sieste de deux heures.',
        },
      },
      chronicles: {
        $: {
          title: 'Chroniques',
          description: 'Les jours qui ont marqué l’Empire, racontés par leurs témoins et retenus par la postérité.',
        },
      },
      firewall: {
        $: {
          title: 'Pare-feu impérial',
          description: 'Les selfies flous refoulés à la frontière et les paquets npm venus du continent.',
        },
      },
      tribunal: {
        $: {
          title: 'Tribunal du linter',
          description: 'Les procès du point-virgule manquant, de l’any implicite et des tabulations.',
        },
      },
      harbour: {
        $: {
          title: 'Affaires portuaires',
          description:
            'Les douanes des imports circulaires, les ferries chargés de dépendances et le phare devenu serveur.',
        },
      },
      diplomacy: {
        $: {
          title: 'Diplomatie',
          description: 'Les traités de paix avec les navigateurs et le sommet des fuseaux horaires.',
        },
      },
      archives: {
        $: {
          title: 'Archives impériales',
          description: 'Le premier commit de l’Empire, la carte perdue du maquis et la disquette de saint Igor.',
        },
      },
      ceremonies: {
        $: {
          title: 'Cérémonies',
          description:
            'Le couronnement du build vert, la bénédiction des branches et la parade des tests de non-régression.',
        },
      },
    },
    maquis: {
      $: { title: 'Le maquis', description: 'Les Corsicamons et la cuisine de l’île, entre deux verres de kvas.' },
      corsicamon: {
        $: {
          title: 'Corsicamon',
          description:
            'Le Corsicadex, les forces et faiblesses de chaque Corsicamon, et comment l’attraper sans renverser son kvas.',
        },
      },
      kitchen: {
        $: {
          title: 'Cuisine impériale',
          description: 'Les recettes impériales de l’île, du brocciu au figatellu, servies en production.',
        },
      },
      donkeys: {
        $: {
          title: 'Les ânes',
          description: 'Les ânes du maquis, qui relisent les pull requests et gardent leur sérénité le vendredi.',
        },
      },
      'chestnut-grove': {
        $: {
          title: 'La châtaigneraie',
          description: 'Les châtaignes compilées à la main et l’arbre aux mille branches git.',
        },
      },
      shepherds: {
        $: { title: 'Bergers', description: 'Les bergers qui comptent en binaire et la transhumance des serveurs.' },
      },
      vigils: { $: { title: 'Veillées', description: 'Les contes du soir, du chargement éternel au cache invalidé.' } },
      tramontane: {
        $: { title: 'La tramontane', description: 'Le vent qui emporte les tests, le cache et la météo des builds.' },
      },
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
  toc: { title: 'Sur cette page', toggle: 'Sommaire' },
  code: { copy: 'Copier le code', copied: 'Code copié', tabs: 'Gestionnaire de paquets' },
  image: { open: 'Agrandir l’image : {alt}', close: 'Fermer l’image' },
  card: { tags: 'Tags', authors: 'Auteurs', more: 'Autres tags' },
  navbar: { nav: 'Navigation principale', menu: 'Menu' },
  locales: { language: 'Langue :' },
  theme: {
    toggle: {
      light: 'Thème clair, passer au thème sombre',
      dark: 'Thème sombre, passer au thème clair',
      unknown: 'Changer de thème',
    },
    pick: { on: 'Thème {name}, thème actuel', choose: 'Passer au thème {name}', unknown: 'Thème {name}' },
    site: 'Thème du site',
    maquis: 'Maquis',
    paper: 'Papier',
  },
  footer: { nav: 'Plan du site', made: 'Made with', love: 'amour' },
  pager: { nav: 'Pages précédente et suivante', previous: 'Précédent', next: 'Suivant' },
  notFound: {
    title: 'Page introuvable',
    text: 'Cette page n’existe pas, ou plus : elle a peut-être été déplacée.',
    home: 'Retour à l’accueil',
  },
  feed: { title: 'Le blog de Figatellultimate', description: 'Les nouvelles de l’Empire d’Igoristan.' },
  collections: { pages: 'Pages', blog: SHARED.blog },
  search: {
    trigger: 'Rechercher',
    title: 'Recherche sur le site',
    close: 'Fermer la recherche',
    input: 'Rechercher sur le site',
    placeholder: 'Rechercher…',
    results: 'Résultats',
    more: 'Voir plus',
    pause: ', ',
    tooShort: 'Tapez au moins {minimum} caractères.',
    searching: 'Recherche…',
    unavailable: 'La recherche est indisponible (lancez figatellultimate search après le build).',
    found: '{count, plural, =0 {Aucun résultat} one {# résultat} many {# de résultats} other {# résultats}}',
    sort: { trigger: 'Trier les résultats', relevance: 'Pertinence' },
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
    unit: '{count, plural, one {article} many {articles} other {articles}}',
  },
  listing: { total: '{count, plural, =0 {Aucun article} one {# article} many {# articles} other {# articles}}' },
  reset: 'Réinitialiser les filtres',
  options: {
    trigger:
      '{count, plural, =0 {Filtres et tri} one {Filtres et tri, # filtre actif} many {Filtres et tri, # filtres actifs} other {Filtres et tri, # filtres actifs}}',
    content: 'Filtres et tri',
  },
  sort: {
    trigger: 'Trier les articles',
    'date-desc': 'Plus récents',
    'date-asc': 'Plus anciens',
    'title-asc': 'A → Z',
    'title-desc': 'Z → A',
    spoken: { 'title-asc': 'Ordre alphabétique', 'title-desc': 'Ordre antialphabétique' },
  },
  pagination: {
    nav: 'Pagination',
    previous: 'Précédent',
    next: 'Suivant',
    page: 'Page {page}',
    current: 'Page {page} sur {pages}, page actuelle',
    more: 'Pages {from} à {to}',
    jump: 'Aller à la page',
    short: '{page} / {pages}',
    spoken: 'Page {page} sur {pages}',
  },
} as const satisfies AppMessages['ui'];

// The whole locale, composed from its sections and locked by the schema: a missing or extra key does not compile.
const fr = { nav, content, taxonomies, ui } as const satisfies AppMessages;

export default fr;
