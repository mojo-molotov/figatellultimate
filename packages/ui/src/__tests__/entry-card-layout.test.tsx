// @vitest-environment happy-dom
// The stylesheet's cascade: only a real browser computes it (`pnpm test:browser`).
import '../styles.css';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { EntryCard } from '../index.js';

const inBrowser = !navigator.userAgent.includes('HappyDOM');
const IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset['theme'];
});

describe('EntryCard, styled', () => {
  const TAGS = ['Kalimba', 'Violoncelle', 'Balalaïka', 'Clarinette', 'Hautbois'].map((label) => ({
    key: label.toLowerCase(),
    label,
  }));
  const tagsCard = (width: string) => (
    <div style={{ width }}>
      <EntryCard
        href="/blog/a"
        title="«Un article»"
        image={IMAGE}
        locale="fr"
        tags={TAGS}
        labels={{ tags: '«Tags»', authors: '«Auteurs»', more: '«Autres tags»' }}
      />
    </div>
  );

  it.skipIf(!inBrowser)('looks the same whatever its heading level', () => {
    const levels = [2, 3, 4, 5, 6] as const;
    const looks = (element: Element): string => {
      const style = getComputedStyle(element);

      return [style.fontSize, style.fontWeight, style.lineHeight, style.margin, style.fontFamily].join(' ');
    };

    render(
      <div style={{ width: '520px' }}>
        {/* Precondition: the browser's own headings differ by level, so a look left to the element would show. */}
        <h2 data-testid="bare-2">a</h2>
        <h6 data-testid="bare-6">a</h6>
        {levels.map((level) => (
          <EntryCard
            key={level}
            href={`/blog/${String(level)}`}
            title={`«Niveau ${String(level)}»`}
            headingLevel={level}
            locale="fr"
            labels={{ tags: '«Tags»', authors: '«Auteurs»', more: '«Autres tags»' }}
          />
        ))}
      </div>,
    );

    expect(looks(screen.getByTestId('bare-2'))).not.toBe(looks(screen.getByTestId('bare-6')));
    const titles = levels.map((level) =>
      looks(screen.getByRole('heading', { level, name: `«Niveau ${String(level)}»` })),
    );

    expect(new Set(titles).size).toBe(1);
  });

  it.skipIf(!inBrowser)('shows the tags that fit whole, then a « +N » pill opening the others', async () => {
    render(tagsCard('520px'));
    const row = screen.getByRole('list', { name: '«Tags»' });
    const pill = await screen.findByRole('button', { name: '«Autres tags»' });
    const room = row.getBoundingClientRect();
    const shown = [...row.querySelectorAll(':scope > [data-slot="entry-card-tag"]:not([data-hidden])')];

    // Precondition: some tags fit, some do not, so both sides are checked.
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(TAGS.length);

    for (const tag of [...shown, pill]) expect(tag.getBoundingClientRect().right).toBeLessThanOrEqual(room.right + 0.5);

    expect(pill.textContent).toBe(`+${String(TAGS.length - shown.length)}`);
    await userEvent.setup().click(pill);
    const popover = await screen.findByRole('dialog', { name: '«Autres tags»' });

    expect(popover.textContent).toBe(
      TAGS.slice(shown.length)
        .map((tag) => tag.label)
        .join(''),
    );
  });

  it.skipIf(!inBrowser)(
    'opens the hidden tags on a mouse’s hover, the focus left where it is; leaving closes them',
    async () => {
      render(tagsCard('520px'));
      const user = userEvent.setup();
      const pill = await screen.findByRole('button', { name: '«Autres tags»' });

      await user.hover(pill);
      await screen.findByRole('dialog', { name: '«Autres tags»' });
      expect(document.activeElement).toBe(document.body);
      await user.unhover(pill);
      // A boolean, never the element: a failed poll's message would serialize the popover, seconds in a real browser,
      // and starve the page's timers, the closing one included.
      await waitFor(() => {
        expect(document.querySelector('[data-slot="entry-card-tags-more-content"]') === null).toBe(true);
      });
      expect(screen.queryByRole('dialog', { name: '«Autres tags»' })).toBeNull();
    },
  );

  it.skipIf(!inBrowser)('keeps the hidden tags open once clicked, the pointer gone', async () => {
    render(tagsCard('520px'));
    const user = userEvent.setup();
    const pill = await screen.findByRole('button', { name: '«Autres tags»' });

    await user.hover(pill);
    await screen.findByRole('dialog', { name: '«Autres tags»' });
    await user.click(pill);
    await user.unhover(pill);
    // Longer than the hover's closing delay: a list pinned by a click stays.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(screen.getByRole('dialog', { name: '«Autres tags»' })).toBeTruthy();
  });

  it.skipIf(!inBrowser)('opens nothing on a touch alone: a phone has no hover, its tap opens the list', async () => {
    render(tagsCard('520px'));
    const user = userEvent.setup();
    const pill = await screen.findByRole('button', { name: '«Autres tags»' });

    // A finger down on the pill, not lifted: no tap yet.
    await user.pointer({ keys: '[TouchA>]', target: pill });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(screen.queryByRole('dialog', { name: '«Autres tags»' })).toBeNull();
    await user.pointer({ keys: '[/TouchA]', target: pill });
    await screen.findByRole('dialog', { name: '«Autres tags»' });
  });

  it.skipIf(!inBrowser)('shows every tag, and no pill, when they all fit', async () => {
    render(tagsCard('1200px'));
    const row = screen.getByRole('list', { name: '«Tags»' });

    await waitFor(() => {
      expect(row.hasAttribute('data-measured')).toBe(true);
    });
    expect(row.querySelectorAll('[data-hidden]').length).toBe(1);
    expect(screen.queryByRole('button', { name: '«Autres tags»' })).toBeNull();
  });

  it.skipIf(!inBrowser)(
    'from the keyboard, rings the whole card and lights it as a hover does; its image zooms for a mouse only',
    async () => {
      render(
        <>
          <button type="button">«avant»</button>
          <EntryCard
            href="/blog/a"
            title="«Un article»"
            image={IMAGE}
            locale="fr"
            labels={{ tags: '«Tags»', authors: '«Auteurs»', more: '«Autres tags»' }}
          />
        </>,
      );
      const user = userEvent.setup();
      const link = screen.getByRole('link', { name: '«Un article»' });
      const card = link.closest('[data-slot="entry-card"]');
      const image = card?.querySelector('[data-slot="entry-card-image"]');

      if (!(card instanceof HTMLElement) || !(image instanceof HTMLElement)) throw new Error('no card');

      const accent = getComputedStyle(document.documentElement).getPropertyValue('--fig-accent').trim();
      // The accent as the browser computes a color: a probe's.
      const probe = document.createElement('span');

      probe.style.color = accent;
      document.body.append(probe);
      const color = getComputedStyle(probe).color;

      probe.remove();
      screen.getByRole('button', { name: '«avant»' }).focus();
      await user.tab();
      // Precondition: the title's link has the keyboard's focus.
      expect(link.matches(':focus-visible')).toBe(true);
      // Once the colors' transitions end.
      await waitFor(() => {
        // The ring around the card, never the clipped title's: the link itself draws none.
        expect(getComputedStyle(card).outlineStyle).toBe('solid');
        expect(getComputedStyle(card).outlineColor).toBe(color);
        expect(getComputedStyle(link).outlineStyle).toBe('none');
        // Lit as a hovered card: its border and its title in the accent, the title underlined.
        expect(getComputedStyle(card).borderTopColor).toBe(color);
        expect(getComputedStyle(link).color).toBe(color);
        expect(getComputedStyle(link).textDecorationLine).toBe('underline');
      });
      // The image keeps its size: its zoom is a pointer's effect.
      expect(getComputedStyle(image).transform).toBe('none');
    },
  );

  it.skipIf(!inBrowser)("animates its image's zoom: no generic transition replaces it", () => {
    render(
      <EntryCard
        href="/blog/a"
        title="«Un article»"
        image={IMAGE}
        locale="fr"
        labels={{ tags: '«Tags»', authors: '«Auteurs»', more: '«Autres tags»' }}
      />,
    );
    const image = document.querySelector('[data-slot="entry-card-image"]');

    if (!(image instanceof HTMLElement)) throw new Error('no image');

    const style = getComputedStyle(image);

    // Precondition: the browser does not ask for reduced motion (the zoom is then off on purpose).
    expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(false);
    expect(style.transitionProperty).toBe('transform');
    expect(style.transitionDuration).toBe('0.4s');
  });

  it.skipIf(!inBrowser).each([720, 360])(
    'keeps one height whatever its text, %ipx wide: a listing never changes height between pages',
    (width) => {
      const long = Array.from({ length: 12 }, () => '«Lorem ipsum dolor sit amet»').join(' ');
      const cards = [
        { title: '«Court»', description: '«Bref.»', tags: [{ key: 'a', label: '«A»' }] },
        {
          title: long,
          description: long,
          tags: Array.from({ length: 12 }, (_, i) => ({ key: String(i), label: '«Violoncelle»' })),
        },
      ];
      const { container } = render(
        <div style={{ width: `${String(width)}px` }}>
          {cards.map((card) => (
            <EntryCard
              key={card.title}
              href="/blog/a"
              title={card.title}
              description={card.description}
              date="2026-11-18"
              tags={card.tags}
              image={IMAGE}
              locale="fr"
              labels={{ tags: '«Tags»', authors: '«Auteurs»', more: '«Autres tags»' }}
            />
          ))}
        </div>,
      );
      const heights = [...container.querySelectorAll('[data-slot="entry-card"]')].map(
        (card) => card.getBoundingClientRect().height,
      );

      // Precondition: the long text would take more room than the short one if nothing reserved it.
      expect(long.length).toBeGreaterThan(200);
      expect(heights).toHaveLength(2);
      // Equal within a float's rounding: Firefox lays out in sixtieths of a pixel (187.33333 against 187.33334).
      expect(heights[0]).toBeCloseTo(heights[1] ?? Number.NaN, 2);
    },
  );

  it.skipIf(!inBrowser)(
    'keeps its one-row tags to itself: a list of tags elsewhere (a post footer) wraps, unfaded',
    () => {
      const { container } = render(
        <ul data-slot="entry-card-tags">
          <li data-slot="entry-card-tag">«Violon»</li>
        </ul>,
      );
      const list = container.querySelector('[data-slot="entry-card-tags"]');

      if (!(list instanceof HTMLElement)) throw new Error('no list');

      const style = getComputedStyle(list);

      expect(style.flexWrap).toBe('wrap');
      expect(style.maskImage === '' || style.maskImage === 'none').toBe(true);
    },
  );
});
