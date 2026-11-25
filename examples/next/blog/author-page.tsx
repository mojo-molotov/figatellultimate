/** An author's page: their avatar, name, short and long bios, and posts. */
import { pageItems } from '@figatellultimate/facets';
import { listingLocalesOf } from '@figatellultimate/site';
import { getTranslations } from 'next-intl/server';
import NextImage from 'next/image';
import type { ReactNode } from 'react';

import { taxonomies } from '#figatellultimate/taxonomies';
import { findAuthorsTermByUrl, type AuthorsTermPage } from '#figatellultimate/terms';
import { pageSegment } from '#figatellultimate/urls';

import { Body } from '../components/mdx';
import { SiteHeader } from '../components/site-header';
import { cardsOf } from './folder-page';
import { indexOf, itemsOf, postsOf } from './posts-data';
import { Listing } from './listing';
import { listingLabels } from './listing-labels';

/** An author's name: the page's title and heading. */
export async function authorName(page: AuthorsTermPage): Promise<string> {
  const t = await getTranslations({ locale: page.locale });

  return t(`taxonomies.authors.${page.term}.name`);
}

/**
 * An author's page, rendered from figatellultimate's neutral data: their avatar (taxonomy data), name and short bio
 * (messages), their long bio when written in this locale (MDX, the term's `content`), then the posts they wrote in
 * this locale with the subcategory page's listing (tags, sorts, the state in the URL), one page at a time: each page
 * (`/authors/igor/page/N`) prerendered with its slice only, a filter or a sort fetching the author's index. The
 * authors facet left out, the author being the page's.
 */
export async function AuthorPage({ page }: { readonly page: AuthorsTermPage }): Promise<ReactNode> {
  const { locale, term } = page;
  const t = await getTranslations({ locale });
  const name = await authorName(page);
  // The page's posts only: the others are their own pages, or the index for a filter.
  const slice = pageItems(page.entries, page.page, page.perPage);
  const posts = await postsOf(slice.map((entry) => entry.item));
  const items = itemsOf(posts);
  const cards = await cardsOf(posts, locale, term);
  const bio = await page.content?.load();

  return (
    <>
      <SiteHeader
        locale={locale}
        url={page.url}
        title={name}
        listing={listingLocalesOf(findAuthorsTermByUrl(page.first) ?? page, findAuthorsTermByUrl)}
      />
      <main data-listing="author">
        <header data-slot="author-header">
          <NextImage src={taxonomies.authors.data[term].avatar} alt="" width={96} height={96} priority />
          <div>
            <h1>{name}</h1>
            <p>{t(`taxonomies.authors.${term}.bio`)}</p>
          </div>
        </header>
        {bio === undefined ? null : (
          <section data-slot="author-bio">
            <Body code={bio.data.mdx} />
          </section>
        )}
        <Listing
          labels={await listingLabels(locale)}
          items={items}
          locale={locale}
          cards={cards}
          facets={['tags']}
          paged={{
            page: page.page,
            pages: page.pages,
            total: page.entries.length,
            perPage: page.perPage ?? page.entries.length,
            first: page.first,
            segment: pageSegment,
            index: indexOf(page),
          }}
        />
      </main>
    </>
  );
}
