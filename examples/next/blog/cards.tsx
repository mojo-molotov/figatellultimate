/**
 * A post's card as data, and its rendering: the server renders a page's cards, the browser those of a filtered view
 * from the listing's index (`listing-index.ts`). Plain data, so that both sides render the same card.
 */
import { Collector } from '@figatellu/effects';
import { EntryCard, type EntryAuthor, type EntryCardLabels, type EntryTag } from '@figatellu/ui';
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
