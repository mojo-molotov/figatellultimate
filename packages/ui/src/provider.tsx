'use client';

/**
 * Combined framework provider (`UiProvider`): wires both `LinkProvider` and `ImageProvider` in a single component so
 * an app hands over its framework link and image components (`next/link`, `next/image`) once.
 *
 * Invariant (`provider.test.tsx`): passes `link` through `LinkProvider`, `image` through `ImageProvider`, and leaves
 * omitted slots to their default plain HTML elements.
 */
import type { ReactNode } from 'react';

import { ImageProvider, type ImageComponent } from './image.js';
import { LinkProvider, type LinkComponent } from './link.js';

/** Props of `UiProvider`. */
export interface UiProviderProps {
  /** Framework link component (e.g. `next/link`) for internal links. */
  readonly link?: LinkComponent | undefined;
  /** Framework image component (e.g. `next/image`) for cards, avatars and content images. */
  readonly image?: ImageComponent | undefined;
  readonly children: ReactNode;
}

/**
 * Provides the app's framework link and image components to every `@figatellultimate/ui` component at once.
 *
 * @param props - Optional `link` and `image` components, and the app tree.
 * @returns The children wrapped in the requested providers.
 *
 * @example
 * <UiProvider link={NextLink} image={NextImage}>{children}</UiProvider>
 */
export function UiProvider({ link, image, children }: UiProviderProps): ReactNode {
  let content = children;

  if (image !== undefined) content = <ImageProvider component={image}>{content}</ImageProvider>;

  if (link !== undefined) content = <LinkProvider component={link}>{content}</LinkProvider>;

  return content;
}
