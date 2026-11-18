/**
 * The entry card: a preview of any entry, generic over collections (no blog-specific field). A server component:
 * only its author preview (`EntryCardAuthor`) ships to the browser.
 *
 * Invariants (`entry-card.test.tsx` and `entry-card-layout.test.tsx` in real browsers): the title links the entry,
 * the date in the locale, the lists named by the labels, the author preview on hover and focus, axe.
 */
import type { ComponentProps, ReactNode } from 'react';

import { EntryCardAuthor, type EntryAuthor } from './entry-card-author.js';
import { Link } from './link.js';

/** A tag: a taxonomy term and its translated label. */
export interface EntryTag {
  readonly key: string;
  readonly label: string;
}

/** The card's own texts: the lists' accessible names. */
export interface EntryCardLabels {
  readonly tags: string;
  readonly authors: string;
}

/** The card's props: an `<article>`'s, plus the entry's fields, the locale and the labels. */
export interface EntryCardProps extends Omit<ComponentProps<'article'>, 'title'> {
  readonly href: string;
  readonly title: string;
  readonly description?: string | undefined;
  /** E.g. the entry's Open Graph image: decorative, the title names the card. */
  readonly image?: string | undefined;
  /** An ISO date, shown for the locale. */
  readonly date?: string | undefined;
  /** Formats the date, e.g. the page's locale. */
  readonly locale: string;
  readonly tags?: readonly EntryTag[] | undefined;
  readonly authors?: readonly EntryAuthor[] | undefined;
  readonly labels: EntryCardLabels;
}

/** `2026-11-12` or a full ISO date, as a `Date`; `undefined` when it is not one. */
function dateOf(value: string): Date | undefined {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * An entry's preview: image, title link, localized date, description, tags, and authors with a preview card.
 *
 * @param props - The entry's URL and title, optionally its image, date (`2026-11-12` or ISO), description, tags and
 *   authors, the locale (for the date), the labels, and an `<article>`'s props.
 * @returns The card: the image and the title link to the entry (through the app's link component); the date in the
 *   locale, a date alone never shifted by a day; the description clamped by the stylesheet.
 *
 * @example
 * <EntryCard href={post.url} title={post.title} image={post.cover} date={post.date} locale="fr"
 *   tags={[{ key: 'release', label: 'Version' }]} authors={[{ key: 'gustave', name: 'Gustave', href: '/authors/gustave' }]}
 *   labels={{ tags: 'Tags', authors: 'Auteurs' }} />
 */
export function EntryCard({
  href,
  title,
  description,
  image,
  date,
  locale,
  tags = [],
  authors = [],
  labels,
  ...props
}: EntryCardProps): ReactNode {
  const parsed = date === undefined ? undefined : dateOf(date);
  // A date without a time is shown without one, in UTC so that it never shifts by a day.
  const formatted =
    parsed === undefined
      ? undefined
      : new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(parsed);

  return (
    <article data-slot="entry-card" {...props}>
      {image === undefined ? null : (
        <Link href={href} data-slot="entry-card-media" tabIndex={-1} aria-hidden>
          <img data-slot="entry-card-image" src={image} alt="" loading="lazy" />
        </Link>
      )}
      <div data-slot="entry-card-body">
        <h3 data-slot="entry-card-title">
          <Link href={href} data-slot="entry-card-link">
            {title}
          </Link>
        </h3>
        {formatted === undefined || date === undefined ? null : (
          <time data-slot="entry-card-date" dateTime={date}>
            {formatted}
          </time>
        )}
        {description === undefined ? null : <p data-slot="entry-card-description">{description}</p>}
        {tags.length === 0 ? null : (
          <ul data-slot="entry-card-tags" aria-label={labels.tags}>
            {tags.map((tag) => (
              <li key={tag.key} data-slot="entry-card-tag" data-tag={tag.key}>
                {tag.label}
              </li>
            ))}
          </ul>
        )}
        {authors.length === 0 ? null : (
          <ul data-slot="entry-card-authors" aria-label={labels.authors}>
            {authors.map((author) => (
              <li key={author.key}>
                <EntryCardAuthor author={author} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
