// @vitest-environment happy-dom
// The reveal is a scroll-driven animation: only a real browser computes it (`pnpm test:browser`).
import '../styles.css';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Reveal } from '../reveal.js';

const inBrowser = !navigator.userAgent.includes('HappyDOM');
const scrollDriven = inBrowser && CSS.supports('animation-timeline', 'view()');

/** Two frames: the scroll-driven animation follows the scroll. */
const frames = async (): Promise<void> => {
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => requestAnimationFrame(resolve));
};

const box = (slot: string): DOMRect => {
  const element = document.querySelector(`[data-slot="${slot}"]`);

  if (element === null) throw new Error(`no ${slot}`);

  return element.getBoundingClientRect();
};

afterEach(() => {
  cleanup();
  window.scrollTo(0, 0);
});

describe('Reveal, styled', () => {
  it.skipIf(!scrollDriven)(
    'reveals its content from under the page: its bottom on the screen’s bottom, then in place',
    async () => {
      render(
        <>
          <div style={{ height: '3000px' }} />
          <Reveal>
            <footer style={{ height: '200px', background: 'black' }} />
          </Reveal>
          <div style={{ height: '1000px' }} />
        </>,
      );
      await frames();
      // Precondition: room to reveal it, below the screen before any scroll.
      expect(document.querySelector('[data-slot="reveal"]')?.hasAttribute('data-revealing')).toBe(true);
      // Half of the slot on the screen: the content is lifted by the half still below it.
      window.scrollTo(0, window.scrollY + box('reveal').top - window.innerHeight + 100);
      await frames();
      // Precondition: the slot is partly on the screen.
      expect(box('reveal').top).toBeCloseTo(window.innerHeight - 100, 0);
      expect(box('reveal-content').bottom).toBeCloseTo(window.innerHeight, 0);

      // The slot in full: the content sits in its place.
      window.scrollTo(0, window.scrollY + 400);
      await frames();
      expect(box('reveal-content').top).toBeCloseTo(box('reveal').top, 0);
    },
  );

  it.skipIf(!scrollDriven)(
    'scrolls to reveal it in full when the focus enters it, hidden though the browser sees it',
    async () => {
      render(
        <>
          <div style={{ height: '3000px' }} />
          <Reveal>
            <footer style={{ height: '200px', background: 'black' }}>
              <a href="#top">«haut»</a>
            </footer>
          </Reveal>
          <div style={{ height: '1000px' }} />
        </>,
      );
      await frames();
      // The slot's top 20 px on the screen: the link, lifted with the content, lies above them, clipped.
      window.scrollTo(0, window.scrollY + box('reveal').top - window.innerHeight + 20);
      await frames();
      const link = document.querySelector('footer a');

      // Precondition: the link is hidden by the slot, yet within the screen, where the browser would not scroll to it.
      expect(link?.getBoundingClientRect().top).toBeLessThan(box('reveal').top);
      expect(link?.getBoundingClientRect().top).toBeGreaterThan(0);
      (link instanceof HTMLElement ? link : undefined)?.focus();
      await frames();
      expect(box('reveal').bottom).toBeLessThanOrEqual(window.innerHeight + 1);
      expect(box('reveal-content').top).toBeCloseTo(box('reveal').top, 0);
    },
  );

  it.skipIf(!scrollDriven).each([
    ['a short page', 100],
    ['a page scrolling less than its height', window.innerHeight - 100],
  ])('stays in its place, unrevealed, on %s', async (_, above) => {
    render(
      <>
        <div style={{ height: `${String(above)}px` }} />
        <Reveal>
          <footer style={{ height: '200px', background: 'black' }} />
        </Reveal>
      </>,
    );
    await frames();
    // Precondition: the slot is on the screen before any scroll.
    expect(box('reveal').top).toBeLessThan(window.innerHeight);
    expect(document.querySelector('[data-slot="reveal"]')?.hasAttribute('data-revealing')).toBe(false);
    expect(box('reveal-content').top).toBeCloseTo(box('reveal').top, 0);
  });

  it.skipIf(!inBrowser)(
    'comes above a panel docked over the page (a sidebar at z-index 40), below popups and dialogs',
    async () => {
      render(
        <>
          <div data-testid="sidebar" style={{ position: 'fixed', zIndex: 40, inset: '0 auto 0 0', width: '16rem' }} />
          <div style={{ height: '3000px' }} />
          <Reveal>
            <footer data-testid="footer" style={{ height: '200px', background: 'black' }} />
          </Reveal>
        </>,
      );
      window.scrollTo(0, document.documentElement.scrollHeight - window.innerHeight);
      await frames();
      // Precondition: the sidebar spans the footer's place.
      expect(box('reveal').top).toBeLessThan(window.innerHeight);
      expect(document.elementFromPoint(20, window.innerHeight - 20)?.getAttribute('data-testid')).toBe('footer');
      expect(
        Number(getComputedStyle(document.querySelector('[data-slot="reveal"]') ?? document.body).zIndex),
      ).toBeLessThan(50);
    },
  );
});
