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

  it.skipIf(!inBrowser)('shows every tag, and no pill, when they all fit', async () => {
    render(tagsCard('1200px'));
    const row = screen.getByRole('list', { name: '«Tags»' });

    await waitFor(() => {
      expect(row.hasAttribute('data-measured')).toBe(true);
    });
    expect(row.querySelectorAll('[data-hidden]').length).toBe(1);
    expect(screen.queryByRole('button', { name: '«Autres tags»' })).toBeNull();
  });

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
      expect(heights[0]).toBe(heights[1]);
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
