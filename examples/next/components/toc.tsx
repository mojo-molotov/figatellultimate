'use client';

/**
 * The table of contents, loaded on demand: a chunk of its own, which only pages with sections download. Still
 * prerendered: React renders a lazy component on the server too.
 */
import type { TableOfContentsProps } from '@figatellu/ui';
import { lazy, type ReactNode } from 'react';

const Lazy = lazy(async () => ({ default: (await import('@figatellu/ui')).TableOfContents }));

/**
 * The page's table of contents.
 *
 * @param props - The `TableOfContents` props: the headings and the labels.
 * @returns The table of contents, its links in the HTML.
 */
export function Toc(props: TableOfContentsProps): ReactNode {
  return <Lazy {...props} />;
}
