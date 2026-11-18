/** The end of a post: its tags, authors and date. */
import { EntryCardAuthor } from '@figatellu/ui';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import type { BlogPost } from '#figatellu/blog';
import { taxonomies } from '#figatellu/taxonomies';
import { authorsTermUrl } from '#figatellu/terms';

/**
 * The end of a post: its tags, and its signature at the end of the line (its authors, then its date), as on its card: the same pills, each author linking their page
 * with the preview of their bio. Out of the indexed body: the search indexes what the post says.
 */
export async function PostFooter({ post }: { readonly post: BlogPost }): Promise<ReactNode> {
  const t = await getTranslations({ locale: post.locale });
  const { tags, authors } = post.terms;
  // As on its card: a long date for the locale, in UTC so that it never shifts by a day.
  const date = new Intl.DateTimeFormat(post.locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(post.data.date),
  );

  return (
    <footer data-slot="post-footer">
      {tags.length === 0 ? null : (
        <ul data-slot="entry-card-tags" aria-label={t('ui.card.tags')}>
          {tags.map((key) => (
            <li key={key} data-slot="entry-card-tag" data-tag={key}>
              {t(`taxonomies.tags.${key}.label`)}
            </li>
          ))}
        </ul>
      )}
      {/* Signed at the end of the line, as a letter: the authors, then the date under them. */}
      <div data-slot="post-signature">
        {authors.length === 0 ? null : (
          <ul data-slot="entry-card-authors" aria-label={t('ui.card.authors')}>
            {authors.map((key) => (
              <li key={key}>
                <EntryCardAuthor
                  author={{
                    key,
                    name: t(`taxonomies.authors.${key}.name`),
                    bio: t(`taxonomies.authors.${key}.bio`),
                    avatar: taxonomies.authors.data[key].avatar,
                    href: authorsTermUrl(key, post.locale),
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        <time data-slot="entry-card-date" dateTime={post.data.date}>
          {date}
        </time>
      </div>
    </footer>
  );
}
