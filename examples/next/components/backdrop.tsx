'use client';

/** The effects' backdrop through `next/image`. */
import { Backdrop } from '@figatellultimate/effects';
import NextImage from 'next/image';
import type { ReactNode } from 'react';

/**
 * A backdrop whose image goes through `next/image`, resized to the page's width. A client component: a server
 * component cannot hand an image component to a client one.
 */
export function SiteBackdrop({ src }: { readonly src: string }): ReactNode {
  return <Backdrop src={src} image={NextImage} />;
}
