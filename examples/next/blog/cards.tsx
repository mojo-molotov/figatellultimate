/**
 * A post's card as data, and its rendering: the server renders a page's cards, the browser those of a filtered view
 * from the listing's index (`listing-index.ts`). Plain data, so that both sides render the same card; a folder page's
 * sections alike (`SectionData`, rendered by `folder-sections.tsx`).
 */
import { Collector } from '@figatellultimate/effects';
import { EntryCard, type EntryAuthor, type EntryCardLabels, type EntryTag } from '@figatellultimate/ui';
import type { ReactNode } from 'react';

/** What a post's card shows, its texts already translated: what `EntryCard` takes. */
export interface CardData {
  readonly href: string;
  readonly title: string;
  readonly description?: string | undefined;
  readonly image?: string | undefined;
  readonly date?: string | undefined;
  readonly locale: string;
  readonly tags: readonly EntryTag[];
  readonly authors: readonly EntryAuthor[];
  readonly labels: EntryCardLabels;
}

/** A subfolder's section as data, its texts translated: a category's card, or a subcategory with its latest posts. */
export interface SectionData {
  readonly title: string;
  /** Its own page, when it has one. */
  readonly href?: string | undefined;
  readonly description?: string | undefined;
  readonly image?: string | undefined;
  /** Its latest posts' cards, newest first (a category's page); none at the root. */
  readonly posts: readonly CardData[];
  /** Towards its every post, when its preview holds fewer. */
  readonly more?: { readonly href: string; readonly text: string } | undefined;
}

/**
 * A post's preview: its Open Graph image, title, localized date, description, tags, and authors.
 *
 * @param props - The card's data.
 * @returns The card, standing out while its link is hovered (the site's own effect).
 */
export function PostCard({ card }: { readonly card: CardData }): ReactNode {
  return (
    <Collector>
      <EntryCard data-key={card.href} {...card} />
    </Collector>
  );
}
