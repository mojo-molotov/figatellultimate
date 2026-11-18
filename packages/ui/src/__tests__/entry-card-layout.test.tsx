// @vitest-environment happy-dom
// The stylesheet's cascade: only a real browser computes it (`pnpm test:browser`).
import '../styles.css';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { EntryCard } from '../index.js';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

const inBrowser = !navigator.userAgent.includes('HappyDOM');
const IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset['theme'];
});

describe('EntryCard, styled', () => {
  it.skipIf(!inBrowser)("animates its image's zoom: no generic transition replaces it", () => {
    render(
      <EntryCard
        href="/blog/a"
        title="«Un article»"
        image={IMAGE}
        locale="fr"
        labels={{ tags: '«Tags»', authors: '«Auteurs»' }}
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
              labels={{ tags: '«Tags»', authors: '«Auteurs»' }}
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
