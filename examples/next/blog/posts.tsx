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
import { isDefaultView, batchPath } from '@figatellultimate/facets';
import {
  FacetOptions,
  FacetsReset,
  ListingOptions,
  PageSelect,
  Pagination,
  SortSelect,
  usePagedCollection,
} from '@figatellultimate/facets-react';
import { NextUrlBoundary } from '@figatellultimate/next16/facets';
import { formatPrecompiled } from '@figatellultimate/use-intl/format';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';
import { useCallback, useMemo, type ReactNode } from 'react';

import { localeInfo, type Locale } from '#figatellultimate/locales';

import { PostCard } from './cards';
import { postsEngine, type PostItem } from './facets';
import { loadListingIndex, loadListingBatch } from './listing-index';
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
  /** The page's heading, on the compact pagination's line when both fit (its own line otherwise). */
  readonly heading?: ReactNode;
}

/**
 * The interactive list: the default view prerendered (real pagination links), its state from the URL once hydrated.
 *
 * @param props - The posts' items, the locale, the cards rendered on the server, the texts and the page.
 * @returns The listing.
 */
export function Posts(props: PostsProps): ReactNode {
  return (
    <NextUrlBoundary first={props.paged?.first} page={props.paged?.page}>
      {(url) => <PostsView {...props} url={url} />}
    </NextUrlBoundary>
  );
}

function PostsView({
  items,
  locale,
  cards,
  facets = ['tags', 'authors'],
  labels,
  paged,
  heading,
  url,
}: PostsProps & { readonly url: UrlAdapter }): ReactNode {
  // The page's slice, then every post once a filter or a sort needs them (`usePagedCollection`).
  const engine = useCallback(
    (all: readonly PostItem[]) => postsEngine(all, locale, paged?.perPage),
    [locale, paged?.perPage],
  );
  const load = useCallback(() => loadListingIndex(paged?.index ?? ''), [paged?.index]);
  // The pages around the reader, ten a small file, loaded on idle: a page they hold is shown at once.
  const batchesOf = useMemo(
    () =>
      paged === undefined
        ? undefined
        : { load: (from: number) => loadListingBatch(`${paged.index}/${batchPath(from).join('/')}`) },
    [paged],
  );
  const { binding, index, prefetch, batches } = usePagedCollection({
    engine,
    items,
    paged,
    load,
    url,
    batches: batchesOf,
  });
  const selecting = !isDefaultView(url.search);
  const cardOf = (key: string): ReactNode => {
    const prerendered = cards[key];
    const data = index?.cards[key] ?? batches.find((batch) => key in batch.cards)?.cards[key];

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
      {/* The page's heading and the compact pagination at the end of its line, below it when they do not fit; the
          full pagination follows the cards. */}
      <div data-slot="listing-toolbar">
        {heading}
        <PageSelect
          binding={binding}
          labels={{
            trigger: labels.pagination.jump,
            current: (page, pages) => formatPrecompiled(labels.pagination.short, locale, { page, pages }),
            spoken: (page, pages) => formatPrecompiled(labels.pagination.spoken, locale, { page, pages }),
          }}
          locale={locale}
          dir={dir}
        />
      </div>
      {/* The count on the left; the sort, then the gear holding the filters, on the right. The index, fetched ahead
          as the reader heads for a filter or a sort. */}
      <div data-slot="listing-controls" onPointerEnter={prefetch} onFocus={prefetch}>
        {/* How many posts the filters give, announced when they change: not to be mistaken for the selected tags' count. */}
        <p data-slot="listing-total" role="status" aria-busy={paged !== undefined && index === undefined && selecting}>
          {formatPrecompiled(labels.total, locale, { count: binding.view.total })}
        </p>
        <SortSelect
          binding={binding}
          labels={{
            trigger: labels.sort.trigger,
            sort: (name) => labels.sort.names[name] ?? name,
            spoken: (name) => labels.sort.spoken[name] ?? labels.sort.names[name] ?? name,
          }}
          dir={dir}
        />
        <ListingOptions
          binding={binding}
          labels={{
            trigger: (count) => formatPrecompiled(labels.options.trigger, locale, { count }),
            content: labels.options.content,
          }}
          locale={locale}
          icon={<Cog6ToothIcon />}
          dir={dir}
        >
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
          {/* Every facet cleared at once, the sort kept. */}
          <FacetsReset binding={binding} labels={{ reset: labels.reset }} />
        </ListingOptions>
      </div>
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
