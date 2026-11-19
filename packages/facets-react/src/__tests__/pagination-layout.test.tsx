// @vitest-environment happy-dom
// The pagination's place on the screen, with real layout and scrolling: only a real browser computes it
// (`pnpm test:browser`).
import { defineFacetedCollection } from '@figatellultimate/facets';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Pagination, useFacetedCollection, type PaginationLabels } from '../index.js';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

const inBrowser = !navigator.userAgent.includes('HappyDOM');

// Nine posts, four a page: the last page holds one, so it is shorter than the others.
const engine = defineFacetedCollection<number>({
  items: Array.from({ length: 9 }, (_, i) => i + 1),
  key: String,
  facets: {},
  sorts: { given: () => 0 },
  perPage: 4,
});

const LABELS: PaginationLabels = {
  nav: '«pagination»',
  previous: '«précédent»',
  next: '«suivant»',
  page: (n) => `«page ${String(n)}»`,
  current: (n, total) => `«page ${String(n)} sur ${String(total)}»`,
  more: (pages) => `«pages ${pages.join(',')}»`,
};

/**
 * A listing below a tall header, so that even its last page scrolls: posts 300 px tall each, the pagination below
 * them, then a footer.
 */
function renderListing(initial: string, remount: boolean) {
  function Listing(): ReactNode {
    const [search, setSearch] = useState(initial);
    const binding = useFacetedCollection(engine, { search, navigate: setSearch });

    return (
      // Without the browser's scroll anchoring, as a theme sets it (or a browser lacks it): the pagination alone
      // keeps its place.
      <main style={{ overflowAnchor: 'none' }}>
        <header style={{ height: '1000px' }} />
        {binding.view.keys.map((key) => (
          <article key={key} style={{ height: '300px' }} />
        ))}
        {/* Remounted on each page, as a router mounting a new page per path does (Next). */}
        <Pagination key={remount ? search : undefined} binding={binding} labels={LABELS} locale="fr" />
        <footer style={{ height: '200px' }} />
      </main>
    );
  }

  render(<Listing />);

  return { user: userEvent.setup() };
}

const nav = (): HTMLElement => screen.getByRole('navigation', { name: '«pagination»' });

const frame = (): Promise<void> =>
  new Promise((resolve) =>
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    }),
  );

const scrollToBottom = async (): Promise<void> => {
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
  await frame();
};

afterEach(() => {
  cleanup();
  window.scrollTo({ top: 0, behavior: 'instant' });
});

describe('Pagination on a page change that changes the page height', () => {
  it.skipIf(!inBrowser).each([
    ['next, to the shorter last page', '?page=2', '«suivant»', false],
    ['previous, from the shorter last page', '?page=3', '«précédent»', false],
    ['next, remounted by a router', '?page=2', '«suivant»', true],
    ['previous, remounted by a router', '?page=3', '«précédent»', true],
  ])('%s: the pagination stays where it was on the screen, under the pointer', async (_, initial, step, remount) => {
    const { user } = renderListing(initial, remount);

    await scrollToBottom();
    const height = document.documentElement.scrollHeight;
    const before = nav().getBoundingClientRect().top;

    await user.click(screen.getByRole('link', { name: step }));
    await frame();

    // Precondition: the page did change height, so that keeping the scroll as it was cannot pass.
    expect(document.documentElement.scrollHeight).not.toBe(height);
    expect(Math.abs(nav().getBoundingClientRect().top - before)).toBeLessThan(1);
    // Focus on the new current page, the activated link may be gone.
    expect(document.activeElement?.getAttribute('aria-current')).toBe('page');
  });
});
