'use client';

/** Routes the design system's links through `next/link` and images through `next/image` via `UiProvider`. */
import { UiProvider } from '@figatellultimate/ui';
import NextImage from 'next/image';
import NextLink from 'next/link';
import type { ReactNode } from 'react';

/**
 * Provides Next.js's `Link` and `Image` components to every `@figatellultimate/ui` component in a single client
 * boundary, keeping layouts mounted across client navigations and serving resized modern image formats.
 */
export function AppProviders({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <UiProvider link={NextLink} image={NextImage}>
      {children}
    </UiProvider>
  );
}
