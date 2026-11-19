// @vitest-environment happy-dom
import type { Heading } from '@figatellultimate/toc';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import axe from 'axe-core';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TableOfContents, type TableOfContentsLabels } from '../index.js';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

const HEADINGS: readonly Heading[] = [
  { id: 'titre', text: '«Titre»', depth: 1 },
  { id: 'installer', text: '«Installer»', depth: 2 },
  { id: 'avec-pnpm', text: '«Avec pnpm»', depth: 3 },
  { id: 'configurer', text: '«Configurer»', depth: 2 },
  { id: 'publier', text: '«Publier»', depth: 2 },
  { id: 'trop-profond', text: '«Trop profond»', depth: 4 },
];

const LABELS: TableOfContentsLabels = { title: '«Sur cette page»' };

/** The article the table of contents points to: each heading carries its id and links to itself (rehype `wrap`). */
function Article() {
  return (
    <article>
      {HEADINGS.map((heading) => {
        return createElement(
          `h${String(heading.depth)}`,
          { key: heading.id, id: heading.id },
          <a href={`#${heading.id}`}>{heading.text}</a>,
        );
      })}
    </article>
  );
}

function renderToc(storageKey = 'test:toc') {
  const user = userEvent.setup();

  render(
    <main>
      <TableOfContents headings={HEADINGS} labels={LABELS} storageKey={storageKey} />
      <Article />
    </main>,
  );

  return { user, nav: screen.getByRole('navigation', { name: '«Sur cette page»' }) };
}

/** A media query that never changes: the component reads `matches` and listens for `change`. */
class FixedMediaQueryList extends EventTarget implements MediaQueryList {
  onchange: MediaQueryList['onchange'] = null;
  constructor(
    readonly matches: boolean,
    readonly media: string,
  ) {
    super();
  }
  // The deprecated listeners, never called by the component.
  addListener(): void {
    return undefined;
  }
  removeListener(): void {
    return undefined;
  }
}

/** Wide screens or not, as the stylesheet's breakpoint sees them. */
function wideScreen(matches: boolean): void {
  const real = window.matchMedia.bind(window);

  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    if (!query.includes('min-width')) return real(query);

    return new FixedMediaQueryList(matches, query);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  history.replaceState(null, '', location.pathname);
});

describe('TableOfContents', () => {
  it('is a landmark named by its title, a nested list of real links to the kept headings', () => {
    const { nav } = renderToc();
    const links = within(nav).getAllByRole('link', { hidden: true });

    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['«Installer»', '#installer'],
      ['«Avec pnpm»', '#avec-pnpm'],
      ['«Configurer»', '#configurer'],
      ['«Publier»', '#publier'],
    ]);
    expect(links[1]?.closest('ol')?.closest('li')?.querySelector('a')?.textContent).toBe('«Installer»');
    expect(nav.getAttribute('data-pagefind-ignore')).toBe('all');
  });

  it('passes axe, the panel closed and open', async () => {
    wideScreen(false);
    const { user, nav } = renderToc();
    const run = async () => (await axe.run(nav, { rules: { region: { enabled: false } } })).violations.map((v) => v.id);

    expect(await run()).toEqual([]);
    await user.click(within(nav).getByRole('button', { name: '«Sur cette page»' }));
    expect(await run()).toEqual([]);
  });

  it('the title is a disclosure: closed by default on a narrow screen, it says whether the list shows', async () => {
    wideScreen(false);
    const { user, nav } = renderToc();
    const toggle = within(nav).getByRole('button', { name: '«Sur cette page»' });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(nav.getAttribute('data-open')).toBe('false');
    expect(document.getElementById(toggle.getAttribute('aria-controls') ?? '')?.getAttribute('data-slot')).toBe(
      'toc-panel',
    );
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(nav.getAttribute('data-open')).toBe('true');
  });

  it("on a wide screen: open by default, and the visitor's choice is remembered", async () => {
    wideScreen(true);
    const first = renderToc('remember:toc');
    const toggle = within(first.nav).getByRole('button', { name: '«Sur cette page»' });

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await first.user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    cleanup();
    const again = renderToc('remember:toc');

    expect(within(again.nav).getByRole('button', { name: '«Sur cette page»' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
  });

  it('a drawer over the content (narrow screen): Escape closes it, and so does following a heading', async () => {
    wideScreen(false);
    const { user, nav } = renderToc();
    const toggle = within(nav).getByRole('button', { name: '«Sur cette page»' });

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await user.keyboard('{Escape}');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle);
    await user.click(within(nav).getByRole('link', { name: '«Configurer»' }));
    expect(location.hash).toBe('#configurer');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('docks against the start edge by default, the end edge on demand', () => {
    const { container, rerender } = render(<TableOfContents headings={HEADINGS} labels={LABELS} />);

    expect(container.querySelector('[data-slot="toc"]')?.getAttribute('data-side')).toBe('start');
    rerender(<TableOfContents headings={HEADINGS} labels={LABELS} side="end" />);
    expect(container.querySelector('[data-slot="toc"]')?.getAttribute('data-side')).toBe('end');
  });

  it('subsections are always listed under their section: nothing folds but the panel', () => {
    const { nav } = renderToc();

    expect(within(nav).getAllByRole('button')).toHaveLength(1);
    expect(within(nav).getByRole('link', { name: '«Avec pnpm»', hidden: true }).closest('[hidden]')).toBeNull();
  });

  it('a click marks the heading current, moves focus to it and replaces the hash', async () => {
    wideScreen(true);
    const { user, nav } = renderToc();
    const before = history.length;

    await user.click(within(nav).getByRole('link', { name: '«Configurer»' }));
    expect(location.hash).toBe('#configurer');
    expect(history.length).toBe(before);
    expect(document.activeElement?.id).toBe('configurer');
    const current = within(nav)
      .getAllByRole('link', { hidden: true })
      .filter((link) => link.hasAttribute('aria-current'));

    expect(current.map((link) => link.textContent)).toEqual(['«Configurer»']);
  });

  it("a heading's own link in the article is followed the same way", async () => {
    wideScreen(true);
    const { user, nav } = renderToc();
    const before = history.length;
    const own = document.getElementById('publier')?.querySelector('a');

    if (own === null || own === undefined) throw new Error('no heading link');

    await user.click(own);
    expect(location.hash).toBe('#publier');
    expect(history.length).toBe(before);
    expect(document.activeElement?.id).toBe('publier');
    expect(within(nav).getByRole('link', { name: '«Publier»' }).getAttribute('aria-current')).toBe('location');
  });

  it('keyboard: Tab reaches the handle, then the links; Enter follows one', async () => {
    wideScreen(true);
    const { user } = renderToc();

    await user.tab();
    // The handle, named by the title.
    expect(document.activeElement?.getAttribute('data-slot')).toBe('toc-toggle');
    await user.tab();
    expect(document.activeElement?.textContent).toBe('«Installer»');
    await user.keyboard('{Enter}');
    expect(location.hash).toBe('#installer');
    expect(document.activeElement?.id).toBe('installer');
  });

  it('a short entry keeps its table of contents; none without kept headings', () => {
    const { container, rerender } = render(<TableOfContents headings={HEADINGS.slice(0, 2)} labels={LABELS} />);

    expect(container.querySelectorAll('[data-slot="toc-link"]')).toHaveLength(1);
    rerender(<TableOfContents headings={HEADINGS.slice(0, 1)} labels={LABELS} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders no text of its own: every text comes from the headings or the labels', () => {
    const { nav } = renderToc();
    const texts = [nav, ...nav.querySelectorAll('*')].flatMap((element) => [
      ...[...element.childNodes].flatMap((node) =>
        node.nodeType === 3 && node.textContent?.trim() ? [node.textContent.trim()] : [],
      ),
      ...(element.getAttribute('aria-label') === null ? [] : [element.getAttribute('aria-label') ?? '']),
    ]);

    expect(texts.length).toBeGreaterThan(3);
    expect(texts.filter((text) => !/^«.*»$/.test(text))).toEqual([]);

    for (const slot of ['toc-panel', 'toc-title', 'toc-toggle', 'toc-list', 'toc-items', 'toc-item', 'toc-link'])
      expect(nav.querySelector(`[data-slot="${slot}"]`), slot).not.toBeNull();

    expect(nav.querySelector('[data-slot="toc-indicator"]')?.getAttribute('aria-hidden')).toBe('true');
  });
});
