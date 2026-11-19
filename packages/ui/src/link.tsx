'use client';

/**
 * Links: figatellultimate's components render their internal links through the app's link component, given once.
 *
 * Invariant (`link.test.tsx`): with a provider, every internal link of the navbar, breadcrumb, card and switcher
 * renders through it, keeping figatellultimate's props; without one, plain anchors.
 */
import { createContext, createElement, use, type ComponentProps, type ComponentType, type ReactNode } from 'react';

/** What a link component receives: an anchor's props, with its `href`. `next/link` fits. */
export type LinkProps = ComponentProps<'a'> & { readonly href: string };

/** The app's link component, e.g. `next/link`: client-side navigations, the layout kept mounted. */
export type LinkComponent = ComponentType<LinkProps>;

const LinkContext = createContext<LinkComponent | null>(null);

/**
 * Gives every internal link of figatellultimate's components the app's link component.
 *
 * @param props - The link component (e.g. `next/link`) and the app.
 * @returns The provider: navigations through the navbar, breadcrumbs, cards and the locale switcher stay client-side,
 *   so the layout keeps its state. Without it, links are plain `<a>`: figatellultimate imports no framework.
 *
 * @example
 * 'use client';
 * export const AppLinks = ({ children }) => <LinkProvider component={NextLink}>{children}</LinkProvider>;
 */
export function LinkProvider({
  component,
  children,
}: {
  readonly component: LinkComponent;
  readonly children: ReactNode;
}): ReactNode {
  return <LinkContext value={component}>{children}</LinkContext>;
}

/**
 * An internal link through the app's link component, or a plain `<a>` without a provider. Internal to the package.
 *
 * @param props - An anchor's props, with its `href`.
 * @returns The link.
 */
export function Link(props: LinkProps): ReactNode {
  const component = use(LinkContext);

  // The app's component, the same on every render (it is given once, to the provider): not created here.
  return component === null ? <a {...props} /> : createElement(component, props);
}
