// @vitest-environment happy-dom
// Layout, with the stylesheet: only a real browser computes it (`pnpm test:browser`); skipped in happy-dom.
import '../styles.css';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { EntryCard, LocaleSwitcher, Navbar, ThemeToggle, type NavigationNode } from '../index.js';
import { navbarScript } from '../scripts.js';

const inBrowser = !navigator.userAgent.includes('HappyDOM');

const ITEMS: readonly NavigationNode[] = [
  { kind: 'entry', url: '/', title: 'Accueil', key: '' },
  { kind: 'entry', url: '/a-long-page-title', title: 'Une page au titre assez long', key: 'a' },
  {
    kind: 'section',
    label: 'docs',
    children: [{ kind: 'entry', url: '/docs/setup', title: 'Installation', key: 'docs/setup' }],
  },
  {
    kind: 'section',
    label: 'blog',
    children: [{ kind: 'entry', url: '/blog/x', title: 'Billet', key: 'blog/x' }],
  },
];

afterEach(() => {
  cleanup();
});

describe('Navbar layout with styles.css', () => {
  /** A navigation of `count` pages, their titles long enough to fill a bar. */
  const pages = (count: number): NavigationNode[] =>
    Array.from({ length: count }, (_, index) => ({
      kind: 'entry',
      url: `/page-${String(index)}`,
      title: `Une page numéro ${String(index)}`,
      key: `page-${String(index)}`,
    }));
  /** A navbar in a bar of the given width: what it shows, and its height against a single line's. */
  const bar = (items: readonly NavigationNode[], width: number) => {
    const { container } = render(
      <div style={{ width: `${String(width)}px` }}>
        <Navbar items={items} t={(key) => key} labels={{ nav: 'Navigation', menu: 'Menu' }} current="/" />
      </div>,
    );
    const navbar = container.querySelector('[data-slot="navbar"]');

    if (!(navbar instanceof HTMLElement)) throw new Error('no navbar');

    return navbar;
  };
  const toggleShown = (navbar: HTMLElement): boolean =>
    getComputedStyle(navbar.querySelector('[data-slot="navbar-toggle"]') ?? navbar).display !== 'none';

  it.skipIf(!inBrowser)('keeps its links on one line, no toggle, while they fit', () => {
    const navbar = bar(pages(3), 1000);
    const tops = [...navbar.querySelectorAll('[data-slot="navbar-link"]')].map((link) =>
      Math.round(link.getBoundingClientRect().top),
    );

    expect(navbar.hasAttribute('data-compact')).toBe(false);
    expect(toggleShown(navbar)).toBe(false);
    // Precondition: the links are there, then on one line.
    expect(tops).toHaveLength(3);
    expect(new Set(tops).size).toBe(1);
  });

  it.skipIf(!inBrowser)(
    'turns compact once its links no longer fit on one line, whatever the screen, never two lines',
    () => {
      const navbar = bar(pages(14), 1000);

      // Precondition: a wide screen, where the width alone would never make it compact.
      expect(window.innerWidth).toBeGreaterThan(1000);
      expect(navbar.hasAttribute('data-compact')).toBe(true);
      expect(toggleShown(navbar)).toBe(true);
      // One line: the toggle's, its links behind it.
      expect(navbar.getBoundingClientRect().height).toBeLessThan(80);
    },
  );

  it.skipIf(!inBrowser)('measures again as its room changes, compact and back', async () => {
    const navbar = bar(pages(5), 1200);
    const room = navbar.parentElement;

    if (room === null) throw new Error('no room');

    // Precondition: five pages fit in 1200px.
    expect(navbar.hasAttribute('data-compact')).toBe(false);
    room.style.width = '420px';
    await waitFor(() => {
      expect(navbar.hasAttribute('data-compact')).toBe(true);
    });
    room.style.width = '1200px';
    await waitFor(() => {
      expect(navbar.hasAttribute('data-compact')).toBe(false);
    });
  });

  it.skipIf(!inBrowser)('is made compact before hydration by its script, when its links do not fit', () => {
    const navbar = bar(pages(14), 1000);

    navbar.removeAttribute('data-compact');
    // The script as the page runs it, after the navbar, before the first paint.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- the inline script's own text, run as the page would.
    new Function(navbarScript)();
    expect(navbar.hasAttribute('data-compact')).toBe(true);
    expect(navbar.hasAttribute('data-measuring')).toBe(false);
  });

  it.skipIf(!inBrowser)(
    "a section shown as a link (`menu: false`) is highlighted on its pages' descendants too",
    () => {
      const docs: NavigationNode = {
        kind: 'section',
        label: 'Documentation',
        url: '/docs',
        menu: false,
        children: [{ kind: 'entry', url: '/docs/setup', title: 'Installation', key: 'docs/setup' }],
      };
      const style = (current: string) => {
        render(
          <Navbar items={[docs]} t={(key) => key} labels={{ nav: 'Navigation', menu: 'Menu' }} current={current} />,
        );
        const link = screen.getByRole('link', { name: 'Documentation' });
        const { color, fontWeight } = getComputedStyle(link);

        cleanup();

        return { color, fontWeight };
      };
      const onItsPage = style('/docs');
      const elsewhere = style('/about');

      // Precondition: the highlight shows on its own page, so the comparison below means something.
      expect(onItsPage).not.toEqual(elsewhere);
      expect(style('/docs/setup')).toEqual(onItsPage);
    },
  );

  it.skipIf(!inBrowser).each(['docs', 'blog'])('opens the %s section under its own trigger', async (label) => {
    const user = userEvent.setup();

    render(
      <div style={{ width: '900px' }}>
        <Navbar items={ITEMS} t={(key) => key} labels={{ nav: 'Navigation', menu: 'Menu' }} />
      </div>,
    );
    const trigger = screen.getByRole('button', { name: label });

    await user.click(trigger);
    const content = document.querySelector('[data-slot="navbar-content"]');

    if (content === null) throw new Error('no open content');

    const t = trigger.getBoundingClientRect();
    const c = content.getBoundingClientRect();

    // Below its trigger, starting where the trigger starts (within a few pixels), not at the navbar's left edge.
    expect(c.top).toBeGreaterThanOrEqual(t.bottom);
    expect(Math.abs(c.left - t.left)).toBeLessThan(24);
    // Precondition: the trigger is far from the navbar's start, so a content stuck there would fail.
    expect(t.left).toBeGreaterThan(150);
  });

  it.skipIf(!inBrowser)('aligns entry links, section triggers and the extras on one vertical center', () => {
    render(
      // A page's own line height (the example's is 1.5): taller line boxes are where baselines drift apart.
      <div style={{ width: '1100px', lineHeight: 1.8, fontSize: '18px' }}>
        <Navbar items={ITEMS} t={(key) => key} labels={{ nav: 'Navigation', menu: 'Menu' }}>
          <LocaleSwitcher
            links={[{ locale: 'fr', url: '/', kind: 'entry', current: true }]}
            names={() => 'Français'}
            labels={{ language: 'Langue' }}
          />
          <ThemeToggle labels={{ light: 'Clair', dark: 'Sombre', unknown: 'Thème' }} />
        </Navbar>
      </div>,
    );
    const boxes = [
      screen.getByRole('link', { name: 'Accueil' }),
      screen.getByRole('button', { name: 'docs' }),
      screen.getByRole('button', { name: /Français/ }),
      screen.getByRole('button', { name: /^(Clair|Sombre|Thème)$/ }),
    ].map((element) => element.getBoundingClientRect());
    const [first] = boxes;

    if (first === undefined) throw new Error('no element');

    for (const box of boxes) {
      // Same height and same vertical center: a link and a button look like one row.
      expect(Math.abs(box.height - first.height)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(box.top + box.height / 2 - (first.top + first.height / 2))).toBeLessThanOrEqual(0.5);
    }
  });

  it.skipIf(!inBrowser)('a stacked entry card’s image spans the card’s whole width, on a phone', async () => {
    // A phone's screen, then the configuration's own again (`vitest.browser.config.ts`): only the window's width
    // switches the card to its stacked layout (`max-width: 36rem`).
    const { page } = await import('vitest/browser');

    await page.viewport(390, 844);

    try {
      render(
        <EntryCard
          href="/p"
          title="Un titre"
          description="Une description."
          image="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='630'/%3E"
          locale="fr"
          labels={{ tags: 'Tags', authors: 'Auteurs', more: 'Autres tags' }}
        />,
      );
      const media = document.querySelector('[data-slot="entry-card-media"]')?.getBoundingClientRect();
      const body = document.querySelector('[data-slot="entry-card-body"]')?.getBoundingClientRect();

      // Precondition: stacked, the text above the image's width; side by side, the comparison would mean nothing.
      expect(body?.top).toBeGreaterThan(media?.bottom ?? Infinity);
      expect(Math.abs((media?.width ?? 0) - (body?.width ?? 0))).toBeLessThan(1);
    } finally {
      await page.viewport(1280, 800);
    }
  });

  it.skipIf(!inBrowser)('an entry card’s image fills the card’s whole height beside the text', () => {
    render(
      <div style={{ width: '760px' }}>
        <EntryCard
          href="/p"
          title="Un titre"
          description="Une description assez longue pour prendre plusieurs lignes dans la carte, et même davantage, pour que le texte soit plus haut que l’image."
          image="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='400'/%3E"
          date="2026-11-12"
          locale="fr"
          tags={[{ key: 'a', label: 'A' }]}
          authors={[{ key: 'g', name: 'Gustave' }]}
          labels={{ tags: 'Tags', authors: 'Auteurs', more: 'Autres tags' }}
        />
      </div>,
    );
    const media = document.querySelector('[data-slot="entry-card-media"]');
    const body = document.querySelector('[data-slot="entry-card-body"]');
    const image = document.querySelector('[data-slot="entry-card-image"]');

    if (media === null || body === null || image === null) throw new Error('no card');

    expect(Math.abs(media.getBoundingClientRect().height - body.getBoundingClientRect().height)).toBeLessThanOrEqual(1);
    expect(Math.abs(image.getBoundingClientRect().height - media.getBoundingClientRect().height)).toBeLessThanOrEqual(
      1,
    );
  });

  it.skipIf(!inBrowser)('leaves room between a label and its chevron', async () => {
    const user = userEvent.setup();

    render(<Navbar items={ITEMS} t={(key) => key} labels={{ nav: 'Navigation', menu: 'Menu' }} />);
    const trigger = screen.getByRole('button', { name: 'docs' });

    await user.hover(trigger);
    expect(parseFloat(getComputedStyle(trigger, '::after').marginInlineStart)).toBeGreaterThan(3);
  });

  it.skipIf(!inBrowser)('turns a chevron over while its menu is open', async () => {
    const user = userEvent.setup();

    render(
      <Navbar items={ITEMS} t={(key) => key} labels={{ nav: 'Navigation', menu: 'Menu' }}>
        <LocaleSwitcher
          links={[{ locale: 'fr', url: '/', kind: 'entry', current: true }]}
          names={() => 'Français'}
          labels={{ language: 'Langue' }}
        />
      </Navbar>,
    );
    const trigger = screen.getByRole('button', { name: 'docs' });
    const closed = getComputedStyle(trigger, '::after').transform;

    // The keyboard, not a click: a pointer over the trigger also opens it on hover, racing the click's toggle.
    trigger.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(trigger.getAttribute('data-state')).toBe('open');
    });
    // The transition ends on the rotated state, however slow the runner.
    await waitFor(() => {
      expect(getComputedStyle(trigger, '::after').transform).not.toBe(closed);
    });
    await user.keyboard('{Escape}');
    const switcher = screen.getByRole('button', { name: /Français/ });
    const icon = switcher.querySelector('[data-slot="locale-switcher-icon"]');

    if (icon === null) throw new Error('no icon');

    const before = getComputedStyle(icon, '::after').transform;

    switcher.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(switcher.getAttribute('data-state')).toBe('open');
    });
    await waitFor(() => {
      expect(getComputedStyle(icon, '::after').transform).not.toBe(before);
    });
  });

  it.skipIf(!inBrowser)(
    "shows a popup item's focus by its highlight alone, and a navbar menu's link by its outline",
    async () => {
      const user = userEvent.setup();

      render(
        <Navbar items={ITEMS} t={(key) => key} labels={{ nav: 'Navigation', menu: 'Menu' }}>
          <LocaleSwitcher
            links={[
              { locale: 'fr', url: '/', kind: 'entry', current: true },
              { locale: 'en', url: '/en', kind: 'home', current: false },
            ]}
            names={(locale) => (locale === 'fr' ? 'Français' : 'English')}
            labels={{ language: 'Langue' }}
          />
        </Navbar>,
      );
      const switcher = screen.getByRole('button', { name: /Français/ });

      switcher.focus();
      await user.keyboard('{Enter}');
      await waitFor(() => {
        expect(document.activeElement?.getAttribute('data-slot')).toBe('locale-switcher-item');
      });
      const item = document.activeElement;

      if (item === null) throw new Error('no focused item');

      // Its highlight shows the focus: an outline over it would draw it twice.
      expect(item.hasAttribute('data-highlighted')).toBe(true);
      expect(getComputedStyle(item).outlineStyle).toBe('none');
      // The highlight fades in (the generic color transition), however slow the runner.
      await waitFor(() => {
        expect(getComputedStyle(item).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
      });
      await user.keyboard('{Escape}');
      const trigger = screen.getByRole('button', { name: 'docs' });

      trigger.focus();
      await user.keyboard('{Enter}');
      await waitFor(() => {
        expect(trigger.getAttribute('data-state')).toBe('open');
      });
      await user.tab();
      const link = screen.getByRole('link', { name: 'Installation' });

      await waitFor(() => {
        expect(document.activeElement).toBe(link);
      });
      // A menu's link has no highlight of its own: its outline is its focus.
      expect(getComputedStyle(link).outlineStyle).toBe('solid');
    },
  );
});
