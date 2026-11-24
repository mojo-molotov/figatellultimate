// @vitest-environment happy-dom
// Layout, with the stylesheet: only a real browser computes it (`pnpm test:browser`).
import '../styles.css';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { userEvent } from '@testing-library/user-event';

import { ImageProvider, ImageZoom, type ImageProps } from '../index.js';

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

  it.skipIf(!inBrowser)(
    'shows the zoom out while the button is held, on the frame that holds the pointer, the zoom in once released',
    async () => {
      vi.spyOn(window, 'matchMedia').mockImplementation((media) => new FixedMediaQueryList(true, media));
      render(<ImageZoom labels={LABELS} src={SRC} alt="Une image" />);
      await userEvent.setup().click(screen.getByRole('button', { name: '«agrandir : Une image»' }));
      const frame = (await screen.findByRole('dialog')).querySelector('[data-slot="image-zoom-frame"]');

      if (frame === null) throw new Error('no frame');

      expect(getComputedStyle(frame).cursor).toBe('zoom-in');
      // While the pointer is captured, the browser shows the frame's cursor, wherever the image's is.
      fireEvent.pointerDown(frame, { pointerType: 'mouse', button: 0, buttons: 1, pointerId: 1 });
      await waitFor(() => {
        expect(getComputedStyle(frame).cursor).toBe('zoom-out');
      });
      fireEvent.pointerUp(frame, { pointerType: 'mouse', button: 0, buttons: 0, pointerId: 1 });
      await waitFor(() => {
        expect(getComputedStyle(frame).cursor).toBe('zoom-in');
      });
    },
  );

  it.skipIf(!inBrowser)(
    'opens a measured image at its own size, the screen at most, whatever variant an image component serves',
    async () => {
      vi.spyOn(window, 'matchMedia').mockImplementation((media) => new FixedMediaQueryList(true, media));
      // An image component as `next/image`: a variant wider than the file (1920w for a 400px image), which alone
      // would make the browser shrink it (400 ÷ 1920 × the 90vw it is told).
      const AppImage = (props: ImageProps) => <img {...props} srcSet={`${props.src} 1920w`} />;
      const svg = `data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'/>")}`;

      render(
        <ImageProvider component={AppImage}>
          <ImageZoom labels={LABELS} src={svg} alt="Une carte" width={400} height={300} />
        </ImageProvider>,
      );
      await userEvent.setup().click(screen.getByRole('button', { name: '«agrandir : Une carte»' }));
      // Named by the dialog's title, the enlarged image has no alternative text of its own.
      const dialog = await screen.findByRole('dialog');

      await waitFor(() => {
        const box = dialog.querySelector('[data-slot="image-zoom-full"]')?.getBoundingClientRect();

        if (box === undefined) throw new Error('no enlarged image');

        // Its own 400 × 300: below 90% of the screen's width and height, never shrunk by the variant's density.
        expect(Math.round(box.width)).toBe(400);
        expect(Math.round(box.height)).toBe(300);
      });
    },
  );
});
