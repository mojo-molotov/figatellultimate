'use client';

/**
 * The client part of the header: the navbar, the search, the locale switcher and the theme toggle. Every text comes
 * formatted from the server (`site-header.tsx`); the two that take a count, precompiled, are formatted here.
 */
import { createSearch, SEARCH_SORTS, type SearchSort } from '@figatellultimate/search';
import { SearchDialog } from '@figatellultimate/search-react';
import { usePagedLocaleLinks } from '@figatellultimate/next16/facets';
import type { ListingLocales, LocaleLink } from '@figatellultimate/site';
import { LocaleSwitcher, Navbar, ThemeToggle, type NavigationNode, type ThemeToggleLabels } from '@figatellultimate/ui';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { localeInfo, locales, type Locale } from '#figatellultimate/locales';

import { formatPrecompiled } from '@figatellultimate/use-intl/format';
import type { Precompiled } from '@figatellultimate/use-intl/precompile';

/** Every text of the client header, formatted on the server; the two that take a count, precompiled. */
export interface HeaderLabels {
  readonly navbar: { readonly nav: string; readonly menu: string };
  readonly search: {
    readonly trigger: string;
    /** The trigger's shortcut, an Apple keyboard's keys and any other's. */
    readonly shortcut: { readonly mac: string; readonly other: string };
    readonly title: string;
    readonly close: string;
    readonly input: string;
    readonly placeholder: string;
    readonly results: string;
    readonly searching: string;
    readonly unavailable: string;
    readonly more: string;
    /** Heard between a result's title, place and date: a pause. */
    readonly pause: string;
    readonly sortTrigger: string;
    readonly sorts: Readonly<Record<string, string>>;
    /** The sorts whose name reads badly aloud (an arrow), as a screen reader says them. */
    readonly spoken: Readonly<Record<string, string>>;
    /** Each searchable collection's name, shown on its results; one without a message is shown by its name. */
    readonly collections: Readonly<Partial<Record<string, string>>>;
    readonly tooShort: Precompiled<'ui.search.tooShort'>;
    readonly found: Precompiled<'ui.search.found'>;
  };
  readonly language: string;
  /** The theme toggle's name for each theme on, and while it is not known yet. */
  readonly theme: ThemeToggleLabels;
}

/** A locale's own name, for any code the switcher receives. */
const nameOf = (code: string): string => {
  const known = locales.find((locale) => locale === code);

  return known === undefined ? code : localeInfo[known].label;
};

/**
 * The client header: the navbar from the content (its sections' labels translated on the server), with the search
 * button, the locale switcher and the theme toggle.
 */
export function HeaderBar(props: {
  readonly locale: Locale;
  readonly url: string;
  readonly items: readonly NavigationNode[];
  readonly links: readonly LocaleLink[];
  readonly labels: HeaderLabels;
  /** A paginated listing in each locale: the switcher follows its page shown in the browser (its batches). */
  readonly listing?: ListingLocales | undefined;
  /** The collections the search covers: the searchable ones (`searchable` in the config), as the build mounted them. */
  readonly searchable: readonly string[];
  /** The segment a listing's pages carry in their URLs (`pageSegment` of `#figatellultimate/urls`). */
  readonly segment: string;
}): ReactNode {
  const { locale, url, items, labels, listing, searchable, segment } = props;
  // A page of the listing shown in the browser moved the address, not the server's links: they follow the page.
  const links = usePagedLocaleLinks(props.links, { locale, listing, segment });
  const { search: text } = labels;
  const router = useRouter();
  // next-themes owns the page's theme: the toggle shows it once mounted (the server cannot know it, and
  // hydration keeps the server's attributes), and asks it for the other one.
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  const search = useMemo(() => createSearch({ locale, collections: searchable }), [locale, searchable]);
  const dir = localeInfo[locale].dir;

  return (
    <Navbar
      items={items}
      current={url}
      // Section labels already translated on the server.
      t={(label) => label}
      labels={labels.navbar}
      dir={dir}
      // The blog's menu: its own page and its categories, flat (subcategories through the category pages).
      menuDepth={1}
    >
      <SearchDialog
        search={search}
        dir={dir}
        // Each result's breadcrumb, put on its page as Pagefind metadata; its collection when it has none.
        // Its steps, the chevrons the meta joined them with (`trail.ts`) left to the box, seen and not heard.
        trail={(result) => result.meta['breadcrumb']?.split(/ [›‹] /)}
        // The page being read: its own result is dimmed.
        current={url}
        // Each dated result shows its date, in the page's language.
        locale={locale}
        // Relevance first, then by title or date, chosen in the field.
        sort={{
          sorts: SEARCH_SORTS,
          labels: {
            trigger: text.sortTrigger,
            sort: (sort: SearchSort) => text.sorts[sort] ?? sort,
            spoken: (sort: SearchSort) => text.spoken[sort] ?? text.sorts[sort] ?? sort,
          },
        }}
        labels={{ trigger: text.trigger, shortcut: text.shortcut, title: text.title, close: text.close }}
        boxLabels={{
          input: text.input,
          placeholder: text.placeholder,
          collection: (collection) => text.collections[collection] ?? collection,
          results: text.results,
          status: {
            tooShort: (minimum) => formatPrecompiled(text.tooShort, locale, { minimum }),
            searching: text.searching,
            unavailable: text.unavailable,
            found: (count) => formatPrecompiled(text.found, locale, { count }),
          },
          more: text.more,
          pause: text.pause,
          // Heard instead of the placeholder, whose ellipsis reads badly aloud: what the field needs to search.
          spoken: { placeholder: formatPrecompiled(text.tooShort, locale, { minimum: search.minLength }) },
        }}
        onNavigate={(target) => {
          router.push(target);
        }}
        // The highlighted result prefetched, as `next/link` does for links: Enter opens it at once.
        onHighlight={(target) => {
          router.prefetch(target);
        }}
      />
      <LocaleSwitcher links={links} locale={locale} names={nameOf} labels={{ language: labels.language }} dir={dir} />
      <ThemeToggle
        labels={labels.theme}
        theme={mounted && (resolvedTheme === 'dark' || resolvedTheme === 'light') ? resolvedTheme : undefined}
        onThemeChange={setTheme}
      />
    </Navbar>
  );
}
