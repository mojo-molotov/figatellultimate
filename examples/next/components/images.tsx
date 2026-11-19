'use client';

/** Routes the design system's images through `next/image`. */
import { ImageProvider } from '@figatellultimate/ui';
import NextImage from 'next/image';
import type { ReactNode } from 'react';

/**
 * Every image of figatellultimate's components through `next/image`: the cards' covers, the authors' avatars and the
 * content's measured images, resized and served in modern formats. A client component: the image component is handed
 * over here, never serialized from the server layout.
 */
export function AppImages({ children }: { readonly children: ReactNode }): ReactNode {
  return <ImageProvider component={NextImage}>{children}</ImageProvider>;
}
