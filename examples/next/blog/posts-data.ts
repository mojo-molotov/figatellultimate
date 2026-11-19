/**
 * The blog's posts as data, without a component: the items a listing's engine filters and sorts, the cards' data, and
 * a listing's index URL. Shared by the folder pages (their slice, rendered on the server) and the listings' JSON
 * index (`app/[locale]/listing/[...folder]/route.ts`, every post, rendered in the browser on a filter or a sort).
 */
import { getTranslations } from 'next-intl/server';

import { findBlogPostByUrl, type BlogFolder, type BlogPost } from '#figatellultimate/blog';
import type { Locale } from '#figatellultimate/locales';
import { taxonomies } from '#figatellultimate/taxonomies';
import { authorsTermUrl } from '#figatellultimate/terms';
import { urlOf } from '#figatellultimate/urls';

import type { CardData } from './cards';
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
  const labels = { tags: t('ui.card.tags'), authors: t('ui.card.authors') };

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

/** The URL of a listing's index: every post's item and card, fetched on the first filter or sort. */
export const indexUrlOf = (folder: BlogFolder): string =>
  urlOf(folder.locale, ['listing', ...Object.values(folder.segments)]);

/** The URL of an author's index: every post of theirs, as a subcategory's (`app/[locale]/author-listing`). */
export const authorIndexUrlOf = (page: { readonly locale: Locale; readonly term: string }): string =>
  urlOf(page.locale, ['author-listing', page.term]);
