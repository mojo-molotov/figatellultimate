/**
 * The entry card: a preview of any entry, generic over collections (no blog-specific field). A server component:
 * only its author preview (`EntryCardAuthor`) and its tags' row (`EntryCardTags`, which measures what fits) ship
 * to the browser.
 *
 * Key design decisions:
 *     - The title's heading level is the page's to give (`headingLevel`, 2 by default): a card knows nothing of the
 *       outline it lands in, a listing right under the page's `<h1>` or under a section's `<h2>`, and a fixed level
 *       would skip one. Never 1: the page's title is its `<h1>`. The look is the `data-slot`'s, never the element's,
 *       so every level looks the same.
 *     - Its image is lazy, unless the page says the card is among the first in view (`priority`): only the page knows,
 *       and the first card's image is often its largest contentful paint, which lazy loading delays until layout.
 *
 * Invariants (`entry-card.test.tsx` and `entry-card-layout.test.tsx` in real browsers): the title links the entry,
 * at the heading level given, looking the same at every level; the date in the locale, the lists named by the
 * labels, the author preview on hover and focus, axe; the image lazy, or eager with a high priority; a level 1
 * rejected by the types (`entry-card.test-d.tsx`).
 */
import type { ComponentProps, ReactNode } from 'react';

import { EntryCardAuthor, type EntryAuthor } from './entry-card-author.js';
import { Image } from './image.js';
import { EntryCardTags, type EntryTag } from './entry-card-tags.js';
import { Link } from './link.js';

export type { EntryTag } from './entry-card-tags.js';

/** The card's own texts: the lists' accessible names, and the pill's gathering the tags that do not fit. */
export interface EntryCardLabels {
  readonly tags: string;
  readonly authors: string;
  /** The « +N » pill's name, and its popover's: e.g. `'More tags'`. */
  readonly more: string;
}

/** A card title's heading level: below the page's `<h1>`. */
export type EntryCardHeadingLevel = 2 | 3 | 4 | 5 | 6;

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
  /** The title's heading level, where the card lands in the page's outline: 2 (default) right under its `<h1>`. */
  readonly headingLevel?: EntryCardHeadingLevel | undefined;
  /**
   * One of the first cards in view: its image loaded at once, with a high priority, since it is likely the page's
   * largest contentful paint. Default: `false`, loaded lazily as it nears the viewport.
   */
  readonly priority?: boolean | undefined;
}

/** Each heading level's element. */
const HEADINGS = { 2: 'h2', 3: 'h3', 4: 'h4', 5: 'h5', 6: 'h6' } as const satisfies Record<
  EntryCardHeadingLevel,
  `h${EntryCardHeadingLevel}`
>;

/** `2026-11-12` or a full ISO date, as a `Date`; `undefined` when it is not one. */
function dateOf(value: string): Date | undefined {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * An entry's preview: image, title link, localized date, description, tags, and authors with a preview card.
 *
 * @param props - The entry's URL and title, optionally its image, date (`2026-11-12` or ISO), description, tags and
 *   authors, the locale (for the date), the labels, the title's heading level (2 by default), and an `<article>`'s
 *   props.
 * @returns The card: the image and the title link to the entry (through the app's link component), the title a
 *   heading at the level given, looking the same at every level; the date in the locale, a date alone never shifted
 *   by a day; the description clamped by the stylesheet.
 *
 * @example
 * <EntryCard href={post.url} title={post.title} image={post.cover} date={post.date} locale="fr"
 *   tags={[{ key: 'release', label: 'Version' }]} authors={[{ key: 'gustave', name: 'Gustave', href: '/authors/gustave' }]}
 *   labels={{ tags: 'Tags', authors: 'Auteurs', more: 'Autres tags' }} />
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
  headingLevel = 2,
  priority = false,
  ...props
}: EntryCardProps): ReactNode {
  const Heading = HEADINGS[headingLevel];
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
          {/* Filling its frame, which the card sizes: 12rem beside the text, the whole width once stacked. */}
          <Image
            data-slot="entry-card-image"
            src={image}
            alt=""
            {...(priority ? { loading: 'eager', fetchPriority: 'high' } : { loading: 'lazy' })}
            fill
            sizes="(max-width: 36rem) 100vw, 12rem"
          />
        </Link>
      )}
      <div data-slot="entry-card-body">
        <Heading data-slot="entry-card-title">
          <Link href={href} data-slot="entry-card-link">
            {title}
          </Link>
        </Heading>
        {formatted === undefined || date === undefined ? null : (
          <time data-slot="entry-card-date" dateTime={date}>
            {formatted}
          </time>
        )}
        {description === undefined ? null : <p data-slot="entry-card-description">{description}</p>}
        {tags.length === 0 ? null : <EntryCardTags tags={tags} labels={labels} locale={locale} />}
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
