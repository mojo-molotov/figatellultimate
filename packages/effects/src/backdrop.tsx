// prettier-ignore
/**
 * A backdrop: an image faded in behind a section's content, faint and vignetted, its edges dissolving into the page
 * (a 404, a landing's hero).
 *
 *     [data-slot='backdrop']             fills its section (positioned by the app or a theme), behind its content,
 *       │                                clipped to it, never catching a pointer, hidden from assistive technologies
 *       └─ [data-slot='backdrop-image']  covers it; opaque in its center, transparent from its vignette's edge
 *                                        (a radial mask); faint (`--fig-backdrop-opacity`), faded in once
 *
 * Key design decisions:
 *     - Decorative: an empty alternative text and `aria-hidden`, so that only the section's own content is read.
 *     - Pure CSS: a mask and an animation, nothing measured, rendered on the server as it is.
 *     - Through the app's image component when given one (`image`, e.g. `next/image`), filling the slot at the page's
 *       width; a plain `<img>` otherwise. A prop, not a provider: the effects depend on no other package.
 *     - Every look a token (`styles.css`): the faintness (stronger in the dark theme, where an image reads less), the
 *       vignette's opaque center and its edge, the fade's length. Still with `prefers-reduced-motion`.
 *
 * Invariants (`backdrop.test.tsx`, `styles.test.ts`): hidden from assistive technologies, with no alternative text;
 * never catching a pointer; faded in only for those who accept motion.
 */
import { createElement, type ComponentType, type ReactNode } from 'react';

/** What the app's image component receives from the backdrop: `next/image`'s props it uses. */
export interface BackdropImageProps {
  readonly src: string;
  readonly alt: string;
  /** The image fills the backdrop's slot, which sizes it. */
  readonly fill?: boolean | undefined;
  /** Its width on the page: the whole width. */
  readonly sizes?: string | undefined;
  readonly 'data-slot'?: string | undefined;
}

/**
 * An image behind its section's content, faint, vignetted and faded in.
 *
 * @param props - The image's URL, and the app's image component (e.g. `next/image`), a plain `<img>` without one.
 * @returns The backdrop's slot and its image; its section must be positioned (`position: relative`).
 *
 * @example
 * <main style={{ position: 'relative' }}>
 *   <h1>Page not found</h1>
 *   <Backdrop src="/covers/maquis.jpeg" />
 * </main>
 */
export function Backdrop({
  src,
  image,
}: {
  readonly src: string;
  readonly image?: ComponentType<BackdropImageProps> | undefined;
}): ReactNode {
  return (
    <div data-slot="backdrop" aria-hidden="true">
      {image === undefined ? (
        <img data-slot="backdrop-image" src={src} alt="" />
      ) : (
        createElement(image, { src, alt: '', fill: true, sizes: '100vw', 'data-slot': 'backdrop-image' })
      )}
    </div>
  );
}
