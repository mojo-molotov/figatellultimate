'use client';

/** Routes the design system's links through `next/link`. */
import { LinkProvider } from '@figatellultimate/ui';
import NextLink from 'next/link';
import type { ReactNode } from 'react';

/**
 * Every internal link of figatellultimate's components through `next/link`: navigations stay client-side, so the
 * layout (the cursor glow, the sparkles) stays mounted from page to page. A client component: the link component is
 * handed over here, never serialized from the server layout.
 */
export function AppLinks({ children }: { readonly children: ReactNode }): ReactNode {
  return <LinkProvider component={NextLink}>{children}</LinkProvider>;
}
