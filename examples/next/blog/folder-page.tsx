/** The blog's folder pages: the blog, a category, and a subcategory with its faceted list. */
import { EntryCard } from '@figatellu/ui';
import { getTranslations } from 'next-intl/server';
import NextLink from 'next/link';
import type { ReactNode } from 'react';

import type { BlogFolder, BlogPost, BlogSubfolder } from '#figatellu/blog';
import type { Locale } from '#figatellu/locales';

import { Collector } from '@figatellu/effects';
import { SiteHeader } from '../components/site-header';
import { PostCard } from './cards';
import { FolderPagination } from './folder-pagination';
import { Listing } from './listing';
import { listingLabels } from './listing-labels';
import { cardDataOf, indexUrlOf, itemsOf, postsOf } from './posts-data';

/** The cards of some posts, keyed by URL: rendered once on the server, reordered by key on the client. */
export async function cardsOf(
  posts: readonly BlogPost[],
  locale: Locale,
  currentAuthor?: string,
): Promise<Record<string, ReactNode>> {
  const data = await cardDataOf(posts, locale, currentAuthor);

  return Object.fromEntries(Object.entries(data).map(([url, card]) => [url, <PostCard key={url} card={card} />]));
}

/** A section's heading: its subfolder's name, linking its page when it has one. */
const sectionHeading = (subfolder: BlogSubfolder, label: string): ReactNode => (
  <h2>{subfolder.url === undefined ? label : <NextLink href={subfolder.url}>{label}</NextLink>}</h2>
);

/** A folder page's title: its content message, or the blog's own for the root. */
export async function folderTitle(folder: BlogFolder): Promise<string> {
  const t = await getTranslations({ locale: folder.locale });

  return folder.label === null ? t('nav.blog') : t(folder.label);
}

/** The part of a folder's items its page shows: the whole list without a page size. */
const sliceOf = <T,>(items: readonly T[], folder: BlogFolder): readonly T[] =>
  folder.perPage === undefined ? items : items.slice((folder.page - 1) * folder.perPage, folder.page * folder.perPage);

/**
 * A blog folder page, rendered from figatellu's neutral data, one page at a time (`perPage`, each page prerendered
 * with its slice): the blog lists its categories, each with its description; a category shows each subcategory with
 * its latest posts and "see more", in the folders' order; a subcategory lists its posts with facets, sorts and
 * pagination.
 */
export async function BlogFolderPage({ folder }: { readonly folder: BlogFolder }): Promise<ReactNode> {
  const { locale } = folder;
  const t = await getTranslations({ locale });
  const title = await folderTitle(folder);
  const header = <SiteHeader locale={locale} url={folder.url} crumbs={folder.first} title={title} />;
  const labels = await listingLabels(locale);
  const pagination = (
    <FolderPagination
      page={folder.page}
      pages={folder.pages}
      first={folder.first}
      locale={locale}
      labels={labels.pagination}
    />
  );
  // A heading and the pagination on one line, the pagination at its end; below the heading when they do not fit.
  const withPagination = (heading: ReactNode): ReactNode => (
    <div data-slot="folder-heading">
      {heading}
      {pagination}
    </div>
  );

  if (folder.subfolders.length === 0) {
    // The page's posts only: the others are their own pages, or the index for a filter.
    const posts = await postsOf(sliceOf(folder.entries, folder));

    return (
      <>
        {header}
        <main data-listing={Object.values(folder.segments).join('/')}>
          <h1>{title}</h1>
          <Listing
            labels={labels}
            items={itemsOf(posts)}
            locale={locale}
            cards={await cardsOf(posts, locale)}
            paged={{
              page: folder.page,
              pages: folder.pages,
              total: folder.entries.length,
              perPage: folder.perPage ?? folder.entries.length,
              first: folder.first,
              index: indexUrlOf(folder),
            }}
          />
        </main>
      </>
    );
  }

  // The page's subfolders, in the folders' order: each page is a fixed slice of it.
  const subfolders = sliceOf(folder.subfolders, folder).map((subfolder) => ({
    subfolder,
    label: t(subfolder.label),
    description: subfolder.messages.description,
  }));

  if (folder.level === null) {
    return (
      <>
        {header}
        <main data-folder="root">
          {withPagination(<h1>{title}</h1>)}
          {/* Each category as a post's preview: its image, its title, its description. */}
          <ul data-slot="folder-list">
            {subfolders.map(({ subfolder, label, description }) => (
              <li key={subfolder.label}>
                <Collector>
                  <EntryCard
                    href={subfolder.url ?? folder.url}
                    title={label}
                    {...(description === undefined ? {} : { description: t(description) })}
                    {...(subfolder.image === undefined ? {} : { image: subfolder.image })}
                    locale={locale}
                    labels={{ tags: t('ui.card.tags'), authors: t('ui.card.authors') }}
                  />
                </Collector>
              </li>
            ))}
          </ul>
        </main>
      </>
    );
  }

  const previews = await Promise.all(
    subfolders.map(async ({ subfolder }) => {
      const posts = await postsOf(subfolder.latest);

      return { posts, cards: await cardsOf(posts, locale) };
    }),
  );

  return (
    <>
      {header}
      <main data-folder={folder.level}>
        <h1>{title}</h1>
        {subfolders.map(({ subfolder, label }, index) => (
          <section key={subfolder.label} data-slot="folder-section">
            {/* The pagination on the first section's heading: the page's own title stands alone above them. */}
            {index === 0 ? withPagination(sectionHeading(subfolder, label)) : sectionHeading(subfolder, label)}
            <ol data-slot="listing-cards">
              {(previews[index]?.posts ?? []).map((post) => (
                <li key={post.url}>{previews[index]?.cards[post.url]}</li>
              ))}
            </ol>
            {/* Only towards a list of posts: a category's page lists subcategories, its heading already links it. */}
            {subfolder.url !== undefined &&
            subfolder.level === 'subcategory' &&
            subfolder.total > subfolder.latest.length ? (
              <NextLink href={subfolder.url} data-slot="folder-more">
                {t('ui.folder.more', { count: subfolder.total })}
              </NextLink>
            ) : null}
          </section>
        ))}
      </main>
    </>
  );
}
