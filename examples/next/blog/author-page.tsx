/** An author's page: their avatar, name, short and long bios, and posts. */
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { taxonomies } from '#figatellu/taxonomies';
import type { AuthorsTermPage } from '#figatellu/terms';

import { Body } from '../components/mdx';
import { SiteHeader } from '../components/site-header';
import { cardsOf } from './folder-page';
import { itemsOf, postsOf } from './posts-data';
import { Listing } from './listing';
import { listingLabels } from './listing-labels';

/** An author's name: the page's title and heading. */
export async function authorName(page: AuthorsTermPage): Promise<string> {
  const t = await getTranslations({ locale: page.locale });

  return t(`taxonomies.authors.${page.term}.name`);
}

/**
 * An author's page, rendered from figatellu's neutral data: their avatar (taxonomy data), name and short bio
 * (messages), their long bio when written in this locale (MDX, the term's `content`), then every post they wrote in this locale with the subcategory page's listing (tags, sorts, pagination,
 * the state in the URL); the authors facet left out, the author being the page's.
 */
export async function AuthorPage({ page }: { readonly page: AuthorsTermPage }): Promise<ReactNode> {
  const { locale, term } = page;
  const t = await getTranslations({ locale });
  const name = await authorName(page);
  const posts = await postsOf(page.entries.map((entry) => entry.item));
  const items = itemsOf(posts);
  const cards = await cardsOf(posts, locale, term);
  const bio = await page.content?.load();

  return (
    <>
      <SiteHeader locale={locale} url={page.url} title={name} />
      <main data-listing="author">
        <header data-slot="author-header">
          <img src={taxonomies.authors.data[term].avatar} alt="" width={96} height={96} />
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
        <Listing labels={await listingLabels(locale)} items={items} locale={locale} cards={cards} facets={['tags']} />
      </main>
    </>
  );
}
