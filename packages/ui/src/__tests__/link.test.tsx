// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Breadcrumb, EntryCard, LinkProvider, LocaleSwitcher, Navbar, type LinkProps } from '../index.js';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

/** The app's link component: an anchor marked as the router's, e.g. `next/link`. */
const RouterLink = (props: LinkProps): ReactNode => <a data-router="" {...props} />;

/** Every internal link figatellultimate's components render, inside a provider or not. */
function renderAll(provided: boolean) {
  const user = userEvent.setup();
  const components = (
    <>
      <Navbar
        items={[
          { kind: 'entry', url: '/about', title: '«À propos»', key: 'about' },
          {
            kind: 'section',
            label: 'docs',
            url: '/docs',
            children: [{ kind: 'entry', url: '/docs/setup', title: '«Installation»', key: 'docs/setup' }],
          },
        ]}
        current="/about"
        t={(key) => `«${key}»`}
        labels={{ nav: '«navigation»', menu: '«menu»' }}
      />
      <Breadcrumb
        crumbs={[
          { label: '«Accueil»', message: false, url: '/', current: false },
          { label: '«Ici»', message: false, url: '/ici', current: true },
        ]}
        t={(key) => key}
        labels={{ nav: '«fil»' }}
      />
      <EntryCard
        href="/blog/post"
        title="«Un billet»"
        image="/cover.svg"
        locale="fr"
        authors={[{ key: 'gustave', name: '«Gustave»', href: '/authors/gustave' }]}
        labels={{ tags: '«Tags»', authors: '«Auteurs»' }}
      />
      <LocaleSwitcher
        links={[
          { locale: 'fr', url: '/about', kind: 'entry', current: true },
          { locale: 'en', url: '/en/about', kind: 'entry', current: false },
        ]}
        names={(locale) => `«${locale}»`}
        labels={{ language: '«Langue»' }}
      />
    </>
  );

  render(<main>{provided ? <LinkProvider component={RouterLink}>{components}</LinkProvider> : components}</main>);

  return { user };
}

/** The internal links on the page, by their href, and whether the router renders them. */
const links = (): [string | null, boolean][] =>
  [...document.querySelectorAll('a[href]')].map((link) => [
    link.getAttribute('href'),
    link.hasAttribute('data-router'),
  ]);

afterEach(() => {
  cleanup();
});

describe('LinkProvider', () => {
  it("renders every internal link through the app's component", async () => {
    const { user } = renderAll(true);

    await user.click(screen.getByRole('button', { name: /«Langue»/ }));
    const found = links();

    // Precondition: every component's links are there (navbar, breadcrumb, card, author, switcher).
    expect(found.map(([href]) => href).sort()).toEqual(
      // The navbar's entry, the breadcrumb's home, the card's image and title, its author, the switcher's two locales.
      ['/about', '/', '/blog/post', '/blog/post', '/authors/gustave', '/about', '/en/about'].sort(),
    );
    expect(found.filter(([, router]) => !router)).toEqual([]);
  });

  it('renders plain anchors without a provider: figatellultimate imports no framework', async () => {
    const { user } = renderAll(false);

    await user.click(screen.getByRole('button', { name: /«Langue»/ }));
    expect(links().length).toBeGreaterThan(0);
    expect(links().filter(([, router]) => router)).toEqual([]);
  });

  it('keeps the props figatellultimate sets on a link: its slot and the current page', () => {
    renderAll(true);
    const about = screen.getAllByRole('link', { name: '«À propos»' })[0];

    expect(about?.getAttribute('data-slot')).toBe('navbar-link');
    expect(about?.getAttribute('aria-current')).toBe('page');
    expect(about?.hasAttribute('data-router')).toBe(true);
  });
});
