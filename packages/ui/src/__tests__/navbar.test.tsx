// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';

import { Navbar, type NavbarLabels, type NavigationNode } from '../index.js';

const ITEMS: readonly NavigationNode[] = [
  { kind: 'entry', url: '/', title: '«Accueil»', key: '' },
  { kind: 'entry', url: '/about', title: '«À propos»', key: 'about' },
  {
    kind: 'section',
    label: 'content.pages.docs.$.title',
    url: '/docs',
    children: [
      { kind: 'entry', url: '/docs/setup', title: '«Installation»', key: 'docs/setup' },
      {
        kind: 'section',
        label: 'content.pages.docs.deep.$.title',
        children: [{ kind: 'entry', url: '/docs/deep/inner', title: '«Au fond»', key: 'docs/deep/inner' }],
      },
    ],
  },
  {
    kind: 'section',
    label: 'nav.blog',
    url: '/blog',
    children: [{ kind: 'section', label: 'content.blog.news.$.title', url: '/blog/news', children: [] }],
  },
];

const LABELS: NavbarLabels = { nav: '«navigation»', menu: '«menu»' };
const translate = (key: string): string => `«${key}»`;

function renderNavbar(current?: string, dir?: 'ltr' | 'rtl') {
  const user = userEvent.setup();

  render(
    <header>
      <Navbar items={ITEMS} current={current} t={translate} labels={LABELS} dir={dir}>
        <span>«extra»</span>
      </Navbar>
    </header>,
  );

  return { user };
}

/**
 * axe-core on the document. An open section has Radix NavigationMenu's focus proxy after its trigger (an
 * `aria-hidden` span with `tabindex="0"` that moves Tab into the content), reported by `aria-hidden-focus`: Radix's
 * behavior, accepted like its focus guards; that one element is excluded, the rest is checked.
 */
async function violations(): Promise<string[]> {
  const result = await axe.run(
    { include: [['body']], exclude: [['span[aria-hidden="true"][tabindex="0"]']] },
    { rules: { region: { enabled: false } } },
  );

  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`);
}

const focused = (): Element | null => document.activeElement;

afterEach(() => {
  cleanup();
});

describe('Navbar', () => {
  it('is a navigation landmark of entry links and section triggers, named by their visible text', () => {
    renderNavbar('/about');
    const nav = screen.getByRole('navigation', { name: '«navigation»' });

    expect(within(nav).getByRole('link', { name: '«Accueil»' }).getAttribute('href')).toBe('/');
    expect(within(nav).getByRole('link', { name: '«À propos»' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('button', { name: '«content.pages.docs.$.title»' })).toBeDefined();
    expect(within(nav).getByRole('button', { name: '«nav.blog»' })).toBeDefined();
  });

  it('passes axe, closed and with a section open', async () => {
    const { user } = renderNavbar('/docs/setup');

    expect(await violations()).toEqual([]);
    await user.click(screen.getByRole('button', { name: '«content.pages.docs.$.title»' }));
    expect(screen.getByRole('link', { name: '«Installation»' })).toBeDefined();
    expect(await violations()).toEqual([]);
  });

  it('keyboard: Enter opens a section, Tab enters it, Escape closes it back to its trigger', async () => {
    const { user } = renderNavbar();
    const trigger = screen.getByRole('button', { name: '«content.pages.docs.$.title»' });

    trigger.focus();
    await user.keyboard('{Enter}');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    await user.tab();
    // The section's own page first, then its entries.
    expect(focused()?.textContent).toBe('«content.pages.docs.$.title»');
    expect(focused()?.getAttribute('href')).toBe('/docs');
    await user.tab();
    expect(focused()?.getAttribute('href')).toBe('/docs/setup');
    await user.keyboard('{Escape}');
    expect(focused()).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('keyboard: → moves between top-level items, reversed right to left', async () => {
    const { user } = renderNavbar();

    screen.getByRole('link', { name: '«Accueil»' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(focused()?.textContent).toBe('«À propos»');
    cleanup();
    const rtl = renderNavbar(undefined, 'rtl');

    screen.getByRole('link', { name: '«Accueil»' }).focus();
    await rtl.user.keyboard('{ArrowLeft}');
    expect(focused()?.textContent).toBe('«À propos»');
  });

  it('marks the section holding the current page, and nests subsections as groups', async () => {
    const { user } = renderNavbar('/docs/deep/inner');
    const item = screen
      .getByRole('button', { name: '«content.pages.docs.$.title»' })
      .closest('[data-slot="navbar-item"]');

    expect(item?.hasAttribute('data-active')).toBe(true);
    await user.click(screen.getByRole('button', { name: '«content.pages.docs.$.title»' }));
    expect(screen.getByRole('link', { name: '«Au fond»' }).getAttribute('aria-current')).toBe('page');
  });

  it('marks the section holding a page it does not list (a post under its listing)', () => {
    renderNavbar('/blog/news/a-post');
    const item = screen.getByRole('button', { name: '«nav.blog»' }).closest('[data-slot="navbar-item"]');

    expect(item?.hasAttribute('data-active')).toBe(true);
    // A mere prefix of a name is not a section's page: `/docsy` is not under `/docs`.
    cleanup();
    renderNavbar('/docsy');
    const docs = screen
      .getByRole('button', { name: '«content.pages.docs.$.title»' })
      .closest('[data-slot="navbar-item"]');

    expect(docs?.hasAttribute('data-active')).toBe(false);
  });

  it('a section’s content is flat: linked subsections are hoisted, folders without a page add nothing', async () => {
    const user = userEvent.setup();

    render(
      <Navbar
        items={[
          {
            kind: 'section',
            label: 'blog',
            children: [
              {
                kind: 'section',
                label: 'news',
                children: [
                  { kind: 'section', label: 'bot', url: '/blog/news/bot', children: [] },
                  { kind: 'section', label: 'site', url: '/blog/news/site', children: [] },
                ],
              },
              {
                kind: 'section',
                label: 'guides',
                children: [{ kind: 'section', label: 'start', url: '/blog/guides/start', children: [] }],
              },
            ],
          },
        ]}
        t={translate}
        labels={LABELS}
      />,
    );
    await user.click(screen.getByRole('button', { name: '«blog»' }));
    const content = document.querySelector('[data-slot="navbar-content"]');

    if (!(content instanceof HTMLElement)) throw new Error('not open');

    // One list, three links, no nested list and no heading for the folders without a page.
    expect(content.querySelectorAll('ul')).toHaveLength(1);
    expect(
      within(content)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['«bot»', '«site»', '«start»']);
    expect(content.textContent).not.toContain('«news»');
  });

  it('menuDepth limits how many levels a menu lists: the categories only, at 1', async () => {
    const user = userEvent.setup();

    render(
      <Navbar
        menuDepth={1}
        items={[
          {
            kind: 'section',
            label: 'blog',
            url: '/blog',
            children: [
              {
                kind: 'section',
                label: 'news',
                url: '/blog/news',
                children: [{ kind: 'section', label: 'bot', url: '/blog/news/bot', children: [] }],
              },
            ],
          },
        ]}
        t={translate}
        labels={LABELS}
      />,
    );
    await user.click(screen.getByRole('button', { name: '«blog»' }));
    const content = document.querySelector('[data-slot="navbar-content"]');

    if (!(content instanceof HTMLElement)) throw new Error('not open');

    expect(
      within(content)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['«blog»', '«news»']);
  });

  it('a section with `menu: false` is a link to its page; without a page, it keeps its menu', () => {
    const docs = (url?: string): NavigationNode => ({
      kind: 'section',
      label: 'docs',
      ...(url === undefined ? {} : { url }),
      menu: false,
      children: [{ kind: 'entry', url: '/docs/setup', title: '«setup»', key: 'docs/setup' }],
    });

    render(<Navbar items={[docs('/docs')]} t={translate} labels={LABELS} current="/docs/setup" />);
    const link = screen.getByRole('link', { name: '«docs»' });

    expect(link.getAttribute('href')).toBe('/docs');
    expect(screen.queryByRole('button', { name: '«docs»' })).toBeNull();
    // Its page holds the current one: still the active item.
    expect(link.closest('[data-slot="navbar-item"]')?.hasAttribute('data-active')).toBe(true);
    cleanup();
    render(<Navbar items={[docs()]} t={translate} labels={LABELS} />);
    expect(screen.getByRole('button', { name: '«docs»' })).not.toBeNull();
  });

  it('a section opens on a click, never on hover', async () => {
    const { user } = renderNavbar();
    const trigger = screen.getByRole('button', { name: '«nav.blog»' });

    await user.hover(trigger);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await user.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    // Moving the pointer away does not close it either.
    await user.unhover(trigger);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    await user.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('the narrow-screen toggle says whether the list is shown', async () => {
    const { user } = renderNavbar();
    const toggle = screen.getByRole('button', { name: '«menu»' });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(toggle.getAttribute('aria-controls') ?? '')).not.toBeNull();
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('[data-slot="navbar"]')?.getAttribute('data-state')).toBe('open');
  });

  it('renders no text of its own: every text and aria attribute comes from the content, the labels or the app', async () => {
    const { user } = renderNavbar('/about');

    await user.click(screen.getByRole('button', { name: '«content.pages.docs.$.title»' }));
    const found: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (['STYLE', 'SCRIPT'].includes(node.parentElement?.tagName ?? '')) continue;

      const text = node.textContent?.trim() ?? '';

      if (text !== '') found.push(text);
    }

    for (const element of document.body.querySelectorAll('*'))
      for (const name of ['aria-label', 'title', 'placeholder']) {
        const value = element.getAttribute(name)?.trim();

        if (value !== undefined && value !== '') found.push(value);
      }

    expect(found.length).toBeGreaterThan(5);
    expect(found.filter((text) => !/^«[^«»]*»$/.test(text))).toEqual([]);
  });
});
