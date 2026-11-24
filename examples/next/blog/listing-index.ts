/**
 * A listing's index: every post's item (what the engine filters and sorts) and card, a static JSON per listing
 * (`app/[locale]/listing/[[...folder]]/route.ts`), fetched by the browser on the first filter or sort, never sent with
 * the page; and the batches beside it, a listing's runs of posts or a folder page's runs of sections, loaded on idle.
 * Each checked by its schema before it is read, cached once per URL (`createIndexLoader`).
 */
import { createIndexLoader } from '@figatellultimate/facets-react';
import * as v from 'valibot';

import type { CardData, SectionData } from './cards';
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

const Batch = v.object({ keys: v.array(v.string()), cards: v.record(v.string(), Card) });

/** A run of a listing's pages (`batchesOf`): their posts' keys in the default order, and each one's card. */
export interface ListingBatch {
  readonly keys: readonly string[];
  readonly cards: Readonly<Record<string, CardData>>;
}

/**
 * A listing's batch, fetched once, checked by its schema before it is read: the pages it holds shown without the
 * server.
 *
 * @param url - The batch's URL (`<index>/pages/<first page>`).
 * @returns The batch; rejects when it cannot be fetched or does not match its schema.
 */
export const loadListingBatch: (url: string) => Promise<ListingBatch> = createIndexLoader((json) =>
  v.parse(Batch, json),
);

const Section = v.object({
  title: v.string(),
  href: v.optional(v.string()),
  description: v.optional(v.string()),
  image: v.optional(v.string()),
  posts: v.array(Card),
  more: v.optional(v.object({ href: v.string(), text: v.string() })),
});
const FolderBatch = v.object({ keys: v.array(v.string()), sections: v.record(v.string(), Section) });

/** A run of a folder page's pages (`batchesOf`): their subfolders' keys in the folders' order, and each one's section. */
export interface FolderBatch {
  readonly keys: readonly string[];
  readonly sections: Readonly<Record<string, SectionData>>;
}

/**
 * A folder page's batch (the blog's, a category's), fetched once, checked by its schema before it is read: the pages
 * it holds shown without the server.
 *
 * @param url - The batch's URL (`<folder.batches>/pages/<first page>`).
 * @returns The batch; rejects when it cannot be fetched or does not match its schema.
 */
export const loadFolderBatch: (url: string) => Promise<FolderBatch> = createIndexLoader((json) =>
  v.parse(FolderBatch, json),
);
