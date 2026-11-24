/**
 * The blog's posts as data, without a component: the items a listing's engine filters and sorts, the cards' data, and
 * a listing's index URL. Shared by the folder pages (their slice, rendered on the server) and the listings' JSON
 * index (`app/[locale]/listing/[[...folder]]/route.ts`, every post, rendered in the browser on a filter or a sort).
 */
import { getTranslations } from 'next-intl/server';

import type { ListingLocales } from '@figatellultimate/site';
import {
  findBlogFolderByUrl,
  findBlogPostByUrl,
  type BlogFolder,
  type BlogPost,
  type BlogSubfolder,
} from '#figatellultimate/blog';
import type { Locale } from '#figatellultimate/locales';
import { taxonomies } from '#figatellultimate/taxonomies';
import { authorsTermUrl } from '#figatellultimate/terms';

import type { CardData, SectionData } from './cards';
import type { PostItem } from './facets';

/**
 * The cards of some posts as data, keyed by URL: their terms translated, rendered by `PostCard` on the server (a
 * page's slice) or in the browser (a filtered view, from the listing's index). On an author's page, that author is a
 * plain name on the cards: neither a link to the page itself nor a preview of the bio the page already shows.
 */
export async function cardDataOf(
  posts: readonly BlogPost[],
  locale: Locale,
  currentAuthor?: string,
): Promise<Record<string, CardData>> {
  const t = await getTranslations({ locale });
  const labels = { tags: t('ui.card.tags'), authors: t('ui.card.authors'), more: t('ui.card.more') };

  return Object.fromEntries(
    posts.map((post): [string, CardData] => {
      // Terms were checked against their taxonomies at build time: typed by them.
      const { tags, authors } = post.terms;

      return [
        post.url,
        {
          href: post.url,
          title: post.data.title,
          description: post.data.metadescription,
          image: post.data.featuredPictureUrl,
          date: post.data.date,
          locale,
          tags: tags.map((key) => ({ key, label: t(`taxonomies.tags.${key}.label`) })),
          authors: authors.map((key) => ({
            key,
            name: t(`taxonomies.authors.${key}.name`),
            avatar: taxonomies.authors.data[key].avatar,
            ...(key === currentAuthor
              ? {}
              : { bio: t(`taxonomies.authors.${key}.bio`), href: authorsTermUrl(key, locale) }),
          })),
          labels,
        },
      ];
    }),
  );
}

/** A subfolder's key among its folder's: its segments, unique there. */
export const subfolderKey = (subfolder: BlogSubfolder): string => Object.values(subfolder.segments).join('/');

/**
 * Some subfolders' sections as data, keyed by `subfolderKey`, their texts translated: a folder page's slice, rendered
 * on the server, or a batch's, rendered in the browser (`folder-sections.tsx`). At the root, a category's card; below,
 * a subcategory's latest posts and its "see more".
 */
export async function sectionDataOf(
  subfolders: readonly BlogSubfolder[],
  locale: Locale,
  root: boolean,
): Promise<Record<string, SectionData>> {
  const t = await getTranslations({ locale });

  return Object.fromEntries(
    await Promise.all(
      subfolders.map(async (subfolder): Promise<[string, SectionData]> => {
        const description = subfolder.messages.description;
        const posts = root ? [] : await postsOf(subfolder.latest);
        const cards = await cardDataOf(posts, locale);
        // Only towards a list of posts: a category's page lists subcategories, its heading already links it.
        const more =
          subfolder.url !== undefined && subfolder.level === 'subcategory' && subfolder.total > subfolder.latest.length
            ? { href: subfolder.url, text: t('ui.folder.more', { count: subfolder.total }) }
            : undefined;

        return [
          subfolderKey(subfolder),
          {
            title: t(subfolder.label),
            href: subfolder.url,
            ...(root && description !== undefined ? { description: t(description) } : {}),
            ...(root && subfolder.image !== undefined ? { image: subfolder.image } : {}),
            posts: posts.flatMap((post) => cards[post.url] ?? []),
            ...(more === undefined ? {} : { more }),
          },
        ];
      }),
    ),
  );
}

/** The posts of index items, loaded. */
export const postsOf = async (items: readonly { readonly url: string }[]): Promise<BlogPost[]> =>
  (await Promise.all(items.map((item) => findBlogPostByUrl(item.url)))).filter((post) => post !== undefined);

/** What the listing's engine knows of each post. */
export const itemsOf = (posts: readonly BlogPost[]): PostItem[] =>
  posts.map((post) => ({
    url: post.url,
    title: post.data.title,
    date: post.data.date,
    tags: post.terms.tags,
    authors: post.terms.authors,
  }));

/**
 * A paginated listing's index URL, from the generated data (`folderPages.index`, `pages.index` in the config).
 *
 * @param page - A folder or term page.
 * @returns Its index's URL.
 * @throws {Error} When it has none: the config does not declare its listing's index.
 */
export function indexOf(page: { readonly url: string; readonly index?: string }): string {
  if (page.index === undefined)
    throw new Error(`${page.url} has no listing index: declare \`index\` in its folderPages or its taxonomy's pages.`);

  return page.index;
}

/**
 * A paginated listing in each locale that has it, from its first page's translations: where the locale switcher leads
 * from a page the browser shows (`pageLocaleLinks` of `@figatellultimate/site`).
 *
 * @param first - The listing's first page in the page's locale.
 * @param find - Its kind of page at a URL (a folder, an author's page).
 * @returns Each locale's first page and count of pages.
 */
export function listingLocalesOf<
  P extends {
    readonly first: string;
    readonly pages: number;
    readonly alternates: Readonly<Partial<Record<string, string>>>;
  },
>(first: P, find: (url: string) => P | undefined): ListingLocales {
  return Object.fromEntries(
    Object.entries(first.alternates).flatMap(([locale, url]) => {
      const there = url === undefined ? undefined : find(url);

      return there === undefined ? [] : [[locale, { first: there.first, pages: there.pages }]];
    }),
  );
}

/**
 * A paginated folder in each locale (`listingLocalesOf`): a subcategory's listing, or a folder of folders, whose pages
 * the browser shows from their batches.
 *
 * @param folder - A page of the folder.
 * @returns Each locale's first page and count of pages.
 */
export const folderLocalesOf = (folder: BlogFolder): ListingLocales =>
  listingLocalesOf(findBlogFolderByUrl(folder.first) ?? folder, findBlogFolderByUrl);
