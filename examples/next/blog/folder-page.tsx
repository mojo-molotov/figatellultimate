/**
 * The blog's folder pages: the blog, a category, and a subcategory with its faceted list. Each paginated: a page holds
 * its slice, prerendered; the pages around it come from their batches (`folder.batches`), shown in the browser, a
 * listing's posts (`posts.tsx`) or a folder's sections (`folder-sections.tsx`).
 */
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import type { BlogFolder, BlogPost } from '#figatellultimate/blog';
import type { Locale } from '#figatellultimate/locales';

import { SiteHeader } from '../components/site-header';
import { PostCard } from './cards';
import { FolderSections } from './folder-sections';
import { Listing } from './listing';
import { listingLabels } from './listing-labels';
import { cardDataOf, folderLocalesOf, indexOf, itemsOf, postsOf, sectionDataOf, subfolderKey } from './posts-data';

/** The cards of some posts, keyed by URL: rendered once on the server, reordered by key on the client. */
export async function cardsOf(
  posts: readonly BlogPost[],
  locale: Locale,
  currentAuthor?: string,
): Promise<Record<string, ReactNode>> {
  const data = await cardDataOf(posts, locale, currentAuthor);

  return Object.fromEntries(Object.entries(data).map(([url, card]) => [url, <PostCard key={url} card={card} />]));
}

/** A folder page's title: its content message, or the blog's own for the root. */
export async function folderTitle(folder: BlogFolder): Promise<string> {
  const t = await getTranslations({ locale: folder.locale });

  return folder.label === null ? t('nav.blog') : t(folder.label);
}

/** The part of a folder's items its page shows: the whole list without a page size. */
const sliceOf = <T,>(items: readonly T[], folder: BlogFolder): readonly T[] =>
  folder.perPage === undefined ? items : items.slice((folder.page - 1) * folder.perPage, folder.page * folder.perPage);

/**
 * A blog folder page, rendered from figatellultimate's neutral data, one page at a time (`perPage`, each page prerendered
 * with its slice): the blog lists its categories, each with its description; a category shows each subcategory with
 * its latest posts and "see more", in the folders' order; a subcategory lists its posts with facets, sorts and
 * pagination.
 */
export async function BlogFolderPage({ folder }: { readonly folder: BlogFolder }): Promise<ReactNode> {
  const { locale } = folder;
  const t = await getTranslations({ locale });
  const title = await folderTitle(folder);
  // A folder the browser pages through (its batches): the switcher follows its page.
  const listing = folder.batches === undefined ? undefined : folderLocalesOf(folder);
  const header = <SiteHeader locale={locale} url={folder.url} crumbs={folder.first} title={title} listing={listing} />;
  const labels = await listingLabels(locale);

  if (folder.subfolders.length === 0) {
    // The page's posts only: the others are their own pages, or the index for a filter.
    const posts = await postsOf(sliceOf(folder.entries, folder));

    return (
      <>
        {header}
        <main data-listing={Object.values(folder.segments).join('/')}>
          <Listing
            heading={<h1>{title}</h1>}
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
              index: indexOf(folder),
            }}
          />
        </main>
      </>
    );
  }

  // The page's subfolders, in the folders' order: each page is a fixed slice of it; the others from their batches.
  const subfolders = sliceOf(folder.subfolders, folder);

  return (
    <>
      {header}
      <main data-folder={folder.level ?? 'root'}>
        <FolderSections
          level={folder.level}
          title={title}
          keys={subfolders.map(subfolderKey)}
          sections={await sectionDataOf(subfolders, locale, folder.level === null)}
          paged={{
            page: folder.page,
            pages: folder.pages,
            total: folder.subfolders.length,
            perPage: folder.perPage ?? folder.subfolders.length,
            first: folder.first,
            batches: folder.batches,
          }}
          locale={locale}
          labels={labels.pagination}
          cardLabels={{ tags: t('ui.card.tags'), authors: t('ui.card.authors'), more: t('ui.card.more') }}
        />
      </main>
    </>
  );
}
