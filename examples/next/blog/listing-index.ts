/**
 * A listing's index: every post's item (what the engine filters and sorts) and card, a static JSON per listing
 * (`app/[locale]/listing/[...folder]/route.ts`), fetched by the browser on the first filter or sort, never sent with
 * the page. Checked by its schema before it is read, cached once per listing (`createIndexLoader`).
 */
import { createIndexLoader } from '@figatellultimate/facets-react';
import * as v from 'valibot';

import type { CardData } from './cards';
import type { PostItem } from './facets';

const Term = v.object({ key: v.string(), label: v.string() });
const Author = v.object({
  key: v.string(),
  name: v.string(),
  avatar: v.optional(v.string()),
  bio: v.optional(v.string()),
  href: v.optional(v.string()),
});
const Card = v.object({
  href: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  image: v.optional(v.string()),
  date: v.optional(v.string()),
  locale: v.string(),
  tags: v.array(Term),
  authors: v.array(Author),
  labels: v.object({ tags: v.string(), authors: v.string(), more: v.string() }),
});
const Index = v.object({
  items: v.array(
    v.object({
      url: v.string(),
      title: v.string(),
      date: v.string(),
      tags: v.array(v.string()),
      authors: v.array(v.string()),
    }),
  ),
  cards: v.record(v.string(), Card),
});

/** A listing's index: its items in their natural order, and each one's card. */
export interface ListingIndex {
  readonly items: readonly PostItem[];
  readonly cards: Readonly<Record<string, CardData>>;
}

/**
 * A listing's index, fetched once (`createIndexLoader`), checked by its schema before it is read.
 *
 * @param url - The index's URL.
 * @returns The index; rejects when it cannot be fetched or does not match its schema (a broken build).
 */
export const loadListingIndex: (url: string) => Promise<ListingIndex> = createIndexLoader((json) =>
  v.parse(Index, json),
);
