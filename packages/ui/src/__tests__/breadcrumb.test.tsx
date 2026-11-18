// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';

import { Breadcrumb, type Crumb } from '../index.js';

const CRUMBS: readonly Crumb[] = [
  { label: 'Accueil', message: false, url: '/', current: false },
  { label: 'content.pages.docs.$.title', message: true, url: '/docs', current: false },
  { label: 'nav.blog', message: true, current: false },
  { label: 'Installation', message: false, url: '/docs/setup', current: true },
];

afterEach(() => {
  cleanup();
});

describe('Breadcrumb', () => {
  const t = (key: string): string => `«${key}»`;

  it('is a landmark of real links, the current page marked, and passes axe', async () => {
    render(
      <main>
        <Breadcrumb crumbs={CRUMBS} t={t} labels={{ nav: '«fil d’Ariane»' }} />
      </main>,
    );
    const nav = screen.getByRole('navigation', { name: '«fil d’Ariane»' });
    const links = within(nav).getAllByRole('link');

    // The current page is named, not linked: the reader is already there.
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/', '/docs']);
    expect(within(nav).getByText('Installation').getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByText('Installation').tagName).toBe('SPAN');
    // A section without a page is text, not a link.
    expect(within(nav).getByText('«nav.blog»').tagName).toBe('SPAN');
    expect(within(nav).getByRole('link', { name: '«content.pages.docs.$.title»' })).toBeDefined();
    expect((await axe.run(document.body, { rules: { region: { enabled: false } } })).violations).toEqual([]);
  });

  it('renders nothing for a single step (the home page)', () => {
    render(<Breadcrumb crumbs={CRUMBS.slice(0, 1)} t={t} labels={{ nav: '«fil»' }} />);
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
