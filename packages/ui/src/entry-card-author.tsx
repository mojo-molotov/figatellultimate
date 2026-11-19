'use client';

/**
 * An entry card's author: their name (a link to their page when they have one), with a preview of their bio on hover
 * and on keyboard focus. The one part of an entry card that needs the browser: the card itself renders on the server,
 * this part alone is a client component.
 *
 * Invariants (`entry-card.test.tsx`): the author preview on hover and focus, axe.
 */
import { HoverCard } from 'radix-ui';
import type { ReactNode } from 'react';

import { Image } from './image.js';
import { Link } from './link.js';

/** An author as the app knows them: a taxonomy term's data and messages. */
export interface EntryAuthor {
  readonly key: string;
  readonly name: string;
  readonly avatar?: string | undefined;
  readonly bio?: string | undefined;
  /** The author's page: the name becomes a link to it. */
  readonly href?: string | undefined;
}

/**
 * An author, with a preview card (avatar, name, bio) opening on hover and on keyboard focus (Radix HoverCard).
 *
 * @param props - The author: name, and optionally avatar, bio and the URL of their page.
 * @returns A link to their page when given one, else their name (focusable when it has a preview); the card only
 *   adds the bio, the name stays readable without it.
 *
 * @example
 * <EntryCardAuthor author={{ key: 'gustave', name: 'Gustave', href: '/authors/gustave' }} />
 */
export function EntryCardAuthor({ author }: { readonly author: EntryAuthor }): ReactNode {
  const avatar =
    author.avatar === undefined ? null : (
      <Image data-slot="entry-card-avatar" src={author.avatar} alt="" width={24} height={24} />
    );
  // A link to the author's page when there is one; else the name, focusable when it has a preview.
  const name =
    author.href === undefined ? (
      <span data-slot="entry-card-author" {...(author.bio === undefined ? {} : { tabIndex: 0 })}>
        {avatar}
        <span data-slot="entry-card-author-label">{author.name}</span>
      </span>
    ) : (
      <Link href={author.href} data-slot="entry-card-author">
        {avatar}
        <span data-slot="entry-card-author-label">{author.name}</span>
      </Link>
    );

  if (author.bio === undefined) return name;

  return (
    <HoverCard.Root openDelay={200} closeDelay={100}>
      <HoverCard.Trigger asChild>{name}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content data-slot="entry-card-author-card" sideOffset={6}>
          {author.avatar === undefined ? null : (
            <Image data-slot="entry-card-author-avatar" src={author.avatar} alt="" width={48} height={48} />
          )}
          <div>
            <p data-slot="entry-card-author-name">{author.name}</p>
            <p data-slot="entry-card-author-bio">{author.bio}</p>
          </div>
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
