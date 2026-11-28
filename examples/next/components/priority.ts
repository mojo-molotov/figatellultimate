/**
 * How many previews each kind of page loads at once, in its order, on a phone and on a desktop: the cards in view on
 * arrival, whose images make its largest contentful paint; every card after them loads lazily.
 *
 * Key design decision, as chosen with the user: the page is prerendered, the same HTML for every screen, so the server
 * cannot choose by device. A card in the phone's count loads at once everywhere (`loading="eager"`, a high priority);
 * one beyond it but in the desktop's count stays lazy, and is preloaded by a `<link rel="preload" media>` the browser
 * follows on a desktop only. The preload carries the image's own `srcset` and `sizes` (`getImageProps` of
 * `next/image`, `ENTRY_CARD_IMAGE_SIZES`), so that the image is fetched once: checked by `scripts/verify.ts`.
 * Rejected: reading the device from the request, which would render every page on demand.
 */
import { ENTRY_CARD_IMAGE_SIZES } from '@figatellultimate/ui';
import { getImageProps } from 'next/image';
import { preload } from 'react-dom';

/** Where a desktop starts: the cards beyond a phone's count are preloaded from this width on. */
export const DESKTOP_MEDIA = '(min-width: 64rem)';

/** Each kind of page's count, on a phone and on a desktop (at least as many). */
export const PRIORITY_CARDS = {
  /** The blog's own page: its categories. */
  blog: { mobile: 2, desktop: 4 },
  /** A category: its subcategories' sections, counted across them. */
  category: { mobile: 2, desktop: 4 },
  /** A subcategory: its posts. */
  subcategory: { mobile: 2, desktop: 2 },
  /** An author's page: their posts, under their bio. */
  author: { mobile: 2, desktop: 2 },
  /** A section's page (`/docs`): its pages, subfolder headings aside. */
  section: { mobile: 2, desktop: 2 },
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

  if (rank < mobile) return true;

  if (rank < desktop && image !== undefined) {
    // The image's own sources, as `next/image` serves it in the card: the preload is the image's request.
    const { props } = getImageProps({ src: image, alt: '', fill: true, sizes: ENTRY_CARD_IMAGE_SIZES });

    preload(props.src, {
      as: 'image',
      fetchPriority: 'high',
      media: DESKTOP_MEDIA,
      ...(props.srcSet === undefined ? {} : { imageSrcSet: props.srcSet }),
      ...(props.sizes === undefined ? {} : { imageSizes: props.sizes }),
    });
  }

  return false;
}
