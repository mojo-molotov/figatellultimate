'use client';

/** The image zoom with its labels as plain strings: a server component cannot hand a function to a client one. */
import { ImageZoom } from '@figatellultimate/ui';
import type { ComponentProps, ReactNode } from 'react';

/** An image enlarged in a modal, its labels formatted on the server. */
export function ZoomImage({
  open,
  close,
  ...props
}: ComponentProps<'img'> & { readonly open: string; readonly close: string }): ReactNode {
  // As wide as the text's column (48rem), the whole screen below it: the size `next/image` serves.
  return <ImageZoom sizes="(max-width: 48rem) 100vw, 48rem" {...props} labels={{ open: () => open, close }} />;
}
