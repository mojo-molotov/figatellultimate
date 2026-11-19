'use client';

/**
 * A listing's posts: the facets, the sort, the cards and the pagination, their state in the URL.
 *
 * Two modes:
 *     - All its posts at hand (an author's page): the engine computes every view, cards rendered on the server.
 *     - Paginated in its path (a subcategory, `paged`): the page holds its slice only, prerendered at `/page/N`, its
 *       pagination reaching the other prerendered pages; a filter or a sort fetches the listing's index
 *       (`listing-index.ts`, prefetched as the pointer or the focus reaches the toolbar), and the browser renders the
 *       cards of that view from it. `usePagedCollection` of `@figatellultimate/facets-react` does the orchestration.
 */
import type { UrlAdapter } from '@figatellultimate/facets';
import { isDefaultView, pagedHref } from '@figatellultimate/facets';
import {
  FacetOptions,
  FacetsReset,
  PageSelect,
  Pagination,
  SortSelect,
  usePagedCollection,
} from '@figatellultimate/facets-react';
import { useNextUrl } from '@figatellultimate/next16/facets';
import { formatPrecompiled } from '@figatellultimate/use-intl/format';
import { useCallback, useMemo, type ReactNode } from 'react';

import { localeInfo, type Locale } from '#figatellultimate/locales';

import { PostCard } from './cards';
import { postsEngine, type PostItem } from './facets';
import { loadListingIndex } from './listing-index';
import type { FacetLabels, ListingLabels } from './listing-labels';
import { PAGINATION_ICONS } from './pagination-icons';

/** A listing paginated in its path: its page, its pages, its posts' count, its first page's URL, its index's URL. */
export interface Paged {
  readonly page: number;
  readonly pages: number;
  readonly total: number;
  readonly perPage: number;
  readonly first: string;
  readonly index: string;
}

interface PostsProps {
  /** Every post's item, or the page's only when `paged`. */
  readonly items: readonly PostItem[];
  readonly locale: Locale;
  /** The cards rendered on the server: every post's, or the page's only when `paged`. */
  readonly cards: Readonly<Record<string, ReactNode>>;
  /** Every text, formatted on the server; those that take a count or a page, precompiled (`listing-labels.ts`). */
  readonly labels: ListingLabels;
  /** The facets offered; default both (an author's page leaves out the authors). */
  readonly facets?: readonly ('tags' | 'authors')[] | undefined;
  /** Paginated in its path: the page holds its slice only. */
  readonly paged?: Paged | undefined;
}

/** The interactive list: its state from the URL. */
export function Posts(props: PostsProps): ReactNode {
  return <PostsView {...props} url={useNextUrl({ first: props.paged?.first })} />;
}

/** The default view, prerendered (the `<Suspense>` fallback): the same components, real pagination links. */
export function PrerenderedPosts(props: PostsProps): ReactNode {
  const { paged } = props;
  const url = useMemo(
    (): UrlAdapter =>
      paged === undefined
        ? { search: '', navigate: () => undefined }
        : {
            search: paged.page > 1 ? `?page=${String(paged.page)}` : '',
            navigate: () => undefined,
            href: (search) => pagedHref(paged.first, search),
          },
    [paged],
  );

  return <PostsView {...props} url={url} />;
}

function PostsView({
  items,
  locale,
  cards,
  facets = ['tags', 'authors'],
  labels,
  paged,
  url,
}: PostsProps & { readonly url: UrlAdapter }): ReactNode {
  // The page's slice, then every post once a filter or a sort needs them (`usePagedCollection`).
  const engine = useCallback(
    (all: readonly PostItem[]) => postsEngine(all, locale, paged?.perPage),
    [locale, paged?.perPage],
  );
  const load = useCallback(() => loadListingIndex(paged?.index ?? ''), [paged?.index]);
  const { binding, index, prefetch } = usePagedCollection({ engine, items, paged, load, url });
  const selecting = !isDefaultView(url.search);
  const cardOf = (key: string): ReactNode => {
    const prerendered = cards[key];
    const data = index?.cards[key];

    return prerendered ?? (data === undefined ? null : <PostCard card={data} />);
  };
  // The locale's writing direction: arrow keys follow it in the components.
  const dir = localeInfo[locale].dir;
  // A facet's labels, its trigger formatted with the count of selected terms; term names from the taxonomies.
  const facet = (text: FacetLabels) => ({
    trigger: (count: number) => formatPrecompiled(text.trigger, locale, { count }),
    filter: text.filter,
    list: text.list,
    empty: text.empty,
    term: (key: string) => text.terms[key] ?? key,
    clear: text.clear,
  });

  return (
    <section data-listing="interactive">
      {/* The index, fetched ahead as the reader heads for a filter or a sort. */}
      <div data-slot="listing-toolbar" onPointerEnter={prefetch} onFocus={prefetch}>
        {facets.includes('tags') ? (
          <FacetOptions binding={binding} facet="tags" labels={facet(labels.facets.tags)} locale={locale} dir={dir} />
        ) : null}
        {facets.includes('authors') ? (
          <FacetOptions
            binding={binding}
            facet="authors"
            labels={facet(labels.facets.authors)}
            locale={locale}
            dir={dir}
          />
        ) : null}
        <SortSelect
          binding={binding}
          labels={{ trigger: labels.sort.trigger, sort: (name) => labels.sort.names[name] ?? name }}
          dir={dir}
        />
        {/* Every facet cleared at once, the sort kept. */}
        <FacetsReset binding={binding} labels={{ reset: labels.reset }} />
        {/* The compact pagination, at the toolbar's other end; the full one follows the cards. */}
        <PageSelect
          binding={binding}
          labels={{
            trigger: labels.pagination.jump,
            current: (page, pages) => formatPrecompiled(labels.pagination.short, locale, { page, pages }),
          }}
          locale={locale}
          dir={dir}
        />
      </div>
      {/* How many posts the filters give, announced when they change: not to be mistaken for the selected tags' count. */}
      <p data-slot="listing-total" role="status" aria-busy={paged !== undefined && index === undefined && selecting}>
        {formatPrecompiled(labels.total, locale, { count: binding.view.total })}
      </p>
      <ol data-slot="listing-cards">
        {binding.view.keys.map((key) => (
          <li key={key}>{cardOf(key)}</li>
        ))}
      </ol>
      <Pagination
        binding={binding}
        labels={{
          nav: labels.pagination.nav,
          previous: labels.pagination.previous,
          next: labels.pagination.next,
          page: (page) => formatPrecompiled(labels.pagination.page, locale, { page }),
          current: (page, pages) => formatPrecompiled(labels.pagination.current, locale, { page, pages }),
          more: (pages) =>
            formatPrecompiled(labels.pagination.more, locale, { from: pages[0] ?? 0, to: pages.at(-1) ?? 0 }),
        }}
        locale={locale}
        dir={dir}
        icons={PAGINATION_ICONS}
      />
    </section>
  );
}
