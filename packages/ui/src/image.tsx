'use client';

/**
 * Images: figatellultimate's components render their images through the app's image component, given once, as
 * links go through the app's link component (`link.tsx`).
 *
 *     ImageProvider(component) ──> every Image of EntryCard (cover), EntryCardAuthor (avatars), ImageZoom (content)
 *                                  └─ none given: a plain <img>
 *
 * Key design decisions:
 *     - Framework-free: the package imports no framework; an app hands its component (`next/image`: resized, modern
 *       formats, lazy) to the provider. Rejected: a prop on every component, repeated at every use.
 *     - The props are those `next/image` reads: `src` and `alt` required, `width` and `height` when the image's size
 *       is known (an avatar, a measured content image), `fill` when its box sizes it (a card's cover), `sizes` for
 *       its width on the page. Without a provider, `fill` is dropped: the stylesheet already sizes those images.
 *
 * Invariant (`image.test.tsx`): with a provider, every image of the cards, avatars and zoom renders through it,
 * keeping figatellultimate's props; without one, plain images without `fill`.
 */
import { createContext, createElement, use, type ComponentProps, type ComponentType, type ReactNode } from 'react';

/** What an image component receives: an image's props, `src` and `alt` required, and `next/image`'s `fill`. */
export type ImageProps = Omit<ComponentProps<'img'>, 'src' | 'alt' | 'width' | 'height' | 'ref'> & {
  readonly src: string;
  readonly alt: string;
  readonly width?: number | `${number}` | undefined;
  readonly height?: number | `${number}` | undefined;
  /** The image fills its positioned box, which sizes it: no `width` nor `height`. */
  readonly fill?: boolean | undefined;
  /** Its width on the page, by media condition: which of its sizes the browser fetches. */
  readonly sizes?: string | undefined;
};

/** The app's image component, e.g. `next/image`: images resized and served in modern formats. */
export type ImageComponent = ComponentType<ImageProps>;

const ImageContext = createContext<ImageComponent | null>(null);

/**
 * Gives every image of figatellultimate's components the app's image component.
 *
 * @param props - The image component (e.g. `next/image`) and the app.
 * @returns The provider: the cards' covers, the authors' avatars and the content's images render through it. Without
 *   it, images are plain `<img>`: figatellultimate imports no framework.
 *
 * @example
 * 'use client';
 * export const AppImages = ({ children }) => <ImageProvider component={NextImage}>{children}</ImageProvider>;
 */
export function ImageProvider({
  component,
  children,
}: {
  readonly component: ImageComponent;
  readonly children: ReactNode;
}): ReactNode {
  return <ImageContext value={component}>{children}</ImageContext>;
}

/**
 * An image's dimension in pixels, as an image component reads it: a number, or a string of digits (`'640'`, as an
 * attribute is written); anything else (`'50%'`, `'auto'`) is none. Internal to the package.
 *
 * @param value - A `width` or `height` as an `<img>` takes it.
 * @returns The pixels, or `undefined`.
 */
export function pixelsOf(value: string | number | undefined): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : undefined;

  return value !== undefined && /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : undefined;
}

/**
 * An image through the app's image component, or a plain `<img>` without a provider. Internal to the package.
 *
 * @param props - An image's props, `src` and `alt` required.
 * @returns The image.
 */
export function Image({ fill, ...props }: ImageProps): ReactNode {
  const component = use(ImageContext);

  if (component === null) return <img {...props} />;

  // The app's component, the same on every render (it is given once, to the provider): not created here.
  return createElement(component, fill === undefined ? props : { ...props, fill });
}
