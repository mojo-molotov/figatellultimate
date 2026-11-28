/**
 * `@figatellultimate/next16/images`: responsive LCP image priority for prerendered card lists, a server entry.
 *
 * Key design decisions:
 *     - Static HTML stays identical for every device (no User-Agent detection, no dynamic rendering): cards within
 *       `mobile` load eagerly everywhere (`true` -> `priority` / `loading="eager"`), while cards between `mobile` and
 *       `desktop` stay lazy in the DOM and emit a `<link rel="preload" media>` that only desktop viewports fetch.
 *     - The preload carries `next/image`'s exact `src`, `srcSet` and `sizes` (via `getImageProps`), so the browser
 *       reuses the preloaded response instead of downloading the image twice.
 *     - Injection seams (`seams`) let unit tests verify every branch without mocking `next/image` or `react-dom`.
 *
 * Invariants (`images.test.ts`): returns `true` for ranks `< mobile` without preloading; preloads with exact `srcSet`
 * and `sizes` for `mobile <= rank < desktop` when `src` is present and returns `false`; skips preloading when `src` is
 * absent or `rank >= desktop`.
 */
import { getImageProps } from 'next/image.js';
import { preload } from 'react-dom';

/** Default desktop breakpoint for responsive `<link rel="preload" media>`. */
export const DEFAULT_DESKTOP_MEDIA = '(min-width: 64rem)';

/** Options of `cardImagePriority`. */
export interface CardImagePriorityOptions {
  /** Card rank on the page, starting at 0. */
  readonly rank: number;
  /** Number of cards loaded eagerly on every viewport (mobile above-the-fold count). */
  readonly mobile: number;
  /** Number of cards loaded eagerly or preloaded on desktop viewports. */
  readonly desktop: number;
  /** Card cover image URL, if any. */
  readonly src: string | undefined;
  /** Responsive `sizes` attribute matching the rendered `next/image` component. */
  readonly sizes: string;
  /** Media query gating the desktop-only `<link rel="preload">`; default `DEFAULT_DESKTOP_MEDIA`. */
  readonly media?: string | undefined;
}

/** Injection seams for unit tests. Not an application API. */
export interface CardImagePrioritySeams {
  readonly getImageProps?: (options: {
    readonly src: string;
    readonly alt: string;
    readonly fill: true;
    readonly sizes: string;
  }) => {
    readonly props: { readonly src: string; readonly srcSet?: string | undefined; readonly sizes?: string | undefined };
  };
  readonly preload?: (
    href: string,
    options: {
      readonly as: 'image';
      readonly fetchPriority: 'high';
      readonly media: string;
      readonly imageSrcSet?: string;
      readonly imageSizes?: string;
    },
  ) => void;
}

/**
 * Decides whether a card's image should load eagerly everywhere, and emits a desktop-only `<link rel="preload">` for
 * cards visible above the fold on desktop but below the fold on mobile.
 *
 * @param options - Card rank, mobile/desktop priority counts, image URL, `sizes` and optional desktop media query.
 * @param seams - Optional test seams for `getImageProps` and `preload`.
 * @returns `true` when the card should render eagerly (`rank < mobile`), `false` otherwise.
 *
 * @example
 * const priority = cardImagePriority({ rank, mobile: 1, desktop: 4, src: image, sizes: ENTRY_CARD_IMAGE_SIZES });
 */
export function cardImagePriority(options: CardImagePriorityOptions, seams: CardImagePrioritySeams = {}): boolean {
  const { rank, mobile, desktop, src, sizes, media = DEFAULT_DESKTOP_MEDIA } = options;

  if (rank < mobile) return true;

  if (rank < desktop && src !== undefined) {
    const resolveImage = seams.getImageProps ?? getImageProps;
    const emitPreload = seams.preload ?? preload;
    const { props } = resolveImage({ src, alt: '', fill: true, sizes });

    emitPreload(props.src, {
      as: 'image',
      fetchPriority: 'high',
      media,
      ...(props.srcSet === undefined ? {} : { imageSrcSet: props.srcSet }),
      ...(props.sizes === undefined ? {} : { imageSizes: props.sizes }),
    });
  }

  return false;
}
