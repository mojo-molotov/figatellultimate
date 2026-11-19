// @vitest-environment happy-dom
// Layout, with the stylesheet: only a real browser computes it (`pnpm test:browser`).
import '../styles.css';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImageZoom } from '../index.js';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

const inBrowser = !navigator.userAgent.includes('HappyDOM');
const LABELS = { open: (alt: string) => `«agrandir : ${alt}»`, close: '«fermer»' };
// A 2×1 PNG: its natural width is far below the column's, so a shrinking button would show.
const SRC =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR42mP8z8DwnwEIGGEMAEWbBAHd6SflAAAAAElFTkSuQmCC';

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

/** The app's content rule (the example's): images span the column. */
function Column({ desktop }: { readonly desktop: boolean }) {
  vi.spyOn(window, 'matchMedia').mockImplementation((media) => new FixedMediaQueryList(desktop, media));

  return (
    <article style={{ width: '600px' }}>
      <style>{'article img { display: block; width: 100%; }'}</style>
      <p>
        <ImageZoom labels={LABELS} src={SRC} alt="Une image" />
      </p>
    </article>
  );
}

const imageWidth = (): number => screen.getByRole('img', { hidden: true }).getBoundingClientRect().width;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ImageZoom in a content column', () => {
  it.skipIf(!inBrowser)("keeps the app's image width: the button spans the column like the image it holds", () => {
    render(<Column desktop={false} />);
    const plain = imageWidth();

    // Precondition: the app's rule applies (a natural 2px image would otherwise stay 2px wide).
    expect(plain).toBe(600);
    cleanup();
    render(<Column desktop />);
    expect(screen.getByRole('button', { name: '«agrandir : Une image»' })).toBeTruthy();
    expect(imageWidth()).toBe(plain);
  });

  it.skipIf(!inBrowser)(
    'closing never scrolls the page: the focus returns to the image where the reader left it',
    async () => {
      render(
        <>
          <div style={{ height: '2000px' }} />
          <Column desktop />
          <div style={{ height: '2000px' }} />
        </>,
      );
      const trigger = screen.getByRole('button', { name: '«agrandir : Une image»' });

      // Laid out once decoded (WebKit decodes a data URI asynchronously).
      await waitFor(() => {
        expect(trigger.getBoundingClientRect().height).toBeGreaterThan(0);
      });
      // The reader scrolled halfway past the image: its top above the screen, its bottom still in view.
      const { top, height } = trigger.getBoundingClientRect();

      window.scrollTo(0, window.scrollY + top + height / 2);
      const before = window.scrollY;

      // Precondition: partly out of view, so giving it the focus with a scroll would move the page.
      expect(trigger.getBoundingClientRect().top).toBeLessThan(0);
      expect(trigger.getBoundingClientRect().bottom).toBeGreaterThan(0);
      trigger.click();
      (await screen.findByRole('button', { name: '«fermer»' })).click();
      await waitFor(() => {
        expect(document.activeElement?.getAttribute('aria-label')).toBe('«agrandir : Une image»');
      });
      expect(window.scrollY).toBe(before);
    },
  );
});
