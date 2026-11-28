/**
 * How many previews each kind of page loads at once, in its order, on a phone and on a desktop: the cards in view on
 * arrival, whose images make its largest contentful paint; every card after them loads lazily. Delegates the
 * desktop-only `<link rel="preload" media>` mechanics to `cardImagePriority` of `@figatellultimate/next16/images`.
 */
import { cardImagePriority, DEFAULT_DESKTOP_MEDIA } from '@figatellultimate/next16/images';
import { ENTRY_CARD_IMAGE_SIZES } from '@figatellultimate/ui';

/** Where a desktop starts: the cards beyond a phone's count are preloaded from this width on. */
export const DESKTOP_MEDIA = DEFAULT_DESKTOP_MEDIA;

/** Compact category preview image sizes (matches `base.css`: `5.5rem` on a phone, `8rem` on a desktop). */
export const CATEGORY_CARD_IMAGE_SIZES = '(max-width: 36rem) 5.5rem, 8rem';

/** Each kind of page's count, on a phone and on a desktop (at least as many). */
export const PRIORITY_CARDS = {
  /** The blog's own page: its categories. */
  blog: { mobile: 1, desktop: 4 },
  /** A category: its subcategories' sections, counted across them. */
  category: { mobile: 1, desktop: 4 },
  /** A subcategory: its posts. */
  subcategory: { mobile: 1, desktop: 2 },
  /** An author's page: their posts, under their bio. */
  author: { mobile: 1, desktop: 2 },
  /** A section's page (`/docs`): its pages, subfolder headings aside. */
  section: { mobile: 1, desktop: 2 },
} as const satisfies Readonly<Record<string, { readonly mobile: number; readonly desktop: number }>>;

/** A kind of page showing cards. */
export type CardsPage = keyof typeof PRIORITY_CARDS;

/**
 * Whether a card loads its image at once on every screen; one a desktop shows on arrival but a phone does not is
 * preloaded for a desktop only, its image staying lazy.
 *
 * @param page - The kind of page.
 * @param rank - The card's rank on the page, from 0.
 * @param image - The card's image, if any.
 * @returns `true` for a card among a phone's first: its image eager, with a high priority.
 */
export function cardPriority(page: CardsPage, rank: number, image: string | undefined): boolean {
  const { mobile, desktop } = PRIORITY_CARDS[page];
  const sizes = page === 'category' ? CATEGORY_CARD_IMAGE_SIZES : ENTRY_CARD_IMAGE_SIZES;

  return cardImagePriority({ rank, mobile, desktop, src: image, sizes, media: DESKTOP_MEDIA });
}
