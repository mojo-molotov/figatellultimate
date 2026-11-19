// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImageZoom } from '../index.js';

const LABELS = { open: (alt: string) => `«agrandir : ${alt}»`, close: '«fermer»' };
const ALT = 'Le navbar en mode sombre';
const SRC = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const DESKTOP = '(hover: hover) and (pointer: fine) and (min-width: 64rem)';
/** Server rendering only runs in Node: `react-dom/server` is not a browser module. */
const inBrowser = !navigator.userAgent.includes('HappyDOM');

/** A media query that only changes when told: `matches` and `change`, all the component reads. */
class SwitchableMediaQueryList extends EventTarget implements MediaQueryList {
  onchange: MediaQueryList['onchange'] = null;
  constructor(
    public matches: boolean,
    readonly media: string,
  ) {
    super();
  }
  switch(matches: boolean): void {
    this.matches = matches;
    this.dispatchEvent(new Event('change'));
  }
  // The deprecated listeners, never called by the component.
  addListener(): void {
    return undefined;
  }
  removeListener(): void {
    return undefined;
  }
}

/** A desktop or not, as the component's query sees it. */
function device(desktop: boolean): SwitchableMediaQueryList {
  const query = new SwitchableMediaQueryList(desktop, DESKTOP);
  const real = window.matchMedia.bind(window);

  vi.spyOn(window, 'matchMedia').mockImplementation((media) => (media === DESKTOP ? query : real(media)));

  return query;
}

/** An element's transform origin, its zero depth left out: Firefox writes `25% 25% 0px` for `25% 25%`. */
const originOf = (element: HTMLElement): string => element.style.transformOrigin.replace(/ 0px$/, '');

const trigger = (): HTMLElement => screen.getByRole('button', { name: `«agrandir : ${ALT}»` });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ImageZoom', () => {
  it.skipIf(inBrowser)('is prerendered as the plain image, every prop forwarded, no button', async () => {
    const { renderToString } = await import('react-dom/server');
    const html = renderToString(<ImageZoom labels={LABELS} src={SRC} alt={ALT} width={320} loading="lazy" />);

    expect(html).toContain('data-slot="image-zoom-image"');
    expect(html).toContain(`alt="${ALT}"`);
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain('<button');
  });

  it('stays a plain image off a desktop, and without alternative text', () => {
    device(false);
    const { unmount } = render(<ImageZoom labels={LABELS} src={SRC} alt={ALT} />);

    expect(screen.queryByRole('button')).toBeNull();
    unmount();
    device(true);
    render(<ImageZoom labels={LABELS} src={SRC} alt="" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('becomes a button named from its alt on a desktop, and follows the query', () => {
    const query = device(false);

    render(<ImageZoom labels={LABELS} src={SRC} alt={ALT} />);
    expect(screen.queryByRole('button')).toBeNull();
    // A media change is an event: React's update is flushed inside `act`, never left to the scheduler.
    act(() => {
      query.switch(true);
    });
    expect(trigger().getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger().querySelector('img')?.getAttribute('src')).toBe(SRC);
    act(() => {
      query.switch(false);
    });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('opens a dialog named by the alt, with the image and a close button, and passes axe closed and open', async () => {
    device(true);
    const user = userEvent.setup();

    render(<ImageZoom labels={LABELS} src={SRC} alt={ALT} />);
    const closed = await axe.run(document.body, { rules: { region: { enabled: false } } });

    expect(closed.violations).toEqual([]);
    await user.click(trigger());
    const dialog = screen.getByRole('dialog', { name: ALT });

    expect(dialog.querySelector('[data-slot="image-zoom-full"]')?.getAttribute('src')).toBe(SRC);
    expect(screen.getByRole('button', { name: '«fermer»' })).toBeTruthy();
    const open = await axe.run(dialog);

    expect(open.violations).toEqual([]);
  });

  it('keyboard: Enter opens, focus inside, Escape closes, focus back on the image', async () => {
    device(true);
    const user = userEvent.setup();

    render(<ImageZoom labels={LABELS} src={SRC} alt={ALT} />);
    await user.tab();
    expect(document.activeElement).toBe(trigger());
    await user.keyboard('{Enter}');
    const dialog = screen.getByRole('dialog', { name: ALT });

    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(document.activeElement).toBe(trigger());
  });

  it('closes with its button, and with Space reopens', async () => {
    device(true);
    const user = userEvent.setup();

    render(<ImageZoom labels={LABELS} src={SRC} alt={ALT} />);
    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: '«fermer»' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    trigger().focus();
    await user.keyboard(' ');
    expect(screen.getByRole('dialog', { name: ALT })).toBeTruthy();
  });

  it('holding the left button zooms the image around the pressed point, follows the mouse, releasing returns', async () => {
    device(true);
    const user = userEvent.setup();

    render(<ImageZoom labels={LABELS} src={SRC} alt={ALT} />);
    await user.click(trigger());
    const full = (): HTMLElement => {
      const element = document.querySelector('[data-slot="image-zoom-full"]');

      if (!(element instanceof HTMLElement)) throw new Error('no enlarged image');

      return element;
    };
    const frame = document.querySelector('[data-slot="image-zoom-frame"]');

    if (!(frame instanceof HTMLElement)) throw new Error('no frame');

    // The frame's box, as a browser would measure it (happy-dom has no layout).
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 400, 200));
    expect(full().hasAttribute('data-zoomed')).toBe(false);
    await user.pointer({ keys: '[MouseLeft>]', target: frame, coords: { clientX: 200, clientY: 100 } });
    expect(full().hasAttribute('data-zoomed')).toBe(true);
    expect(originOf(full())).toBe('25% 25%');
    await user.pointer({ target: frame, coords: { clientX: 500, clientY: 250 } });
    expect(originOf(full())).toBe('100% 100%');
    await user.pointer({ keys: '[/MouseLeft]', target: frame });
    expect(full().hasAttribute('data-zoomed')).toBe(false);
    // The zoom out starts from where the reader was looking: the point stays, the image shrinks around it.
    expect(originOf(full())).toBe('100% 100%');
    // A new press zooms around its own point.
    await user.pointer({ keys: '[MouseLeft>]', target: frame, coords: { clientX: 300, clientY: 150 } });
    expect(originOf(full())).toBe('50% 50%');
    await user.pointer({ keys: '[/MouseLeft]', target: frame });
    // Still open: pressing the image never closes the dialog.
    expect(screen.getByRole('dialog', { name: ALT })).toBeTruthy();
  });

  it('only the left button zooms, and moving without it does nothing', async () => {
    device(true);
    const user = userEvent.setup();

    render(<ImageZoom labels={LABELS} src={SRC} alt={ALT} />);
    await user.click(trigger());
    const frame = document.querySelector('[data-slot="image-zoom-frame"]');

    if (!(frame instanceof HTMLElement)) throw new Error('no frame');

    await user.pointer({ target: frame, coords: { clientX: 10, clientY: 10 } });
    await user.pointer({ keys: '[MouseRight>]', target: frame });
    expect(document.querySelector('[data-slot="image-zoom-full"][data-zoomed]')).toBeNull();
  });

  it('zooms even when the browser cannot capture the pointer (one it no longer counts as active)', async () => {
    device(true);
    const user = userEvent.setup();

    render(<ImageZoom labels={LABELS} src={SRC} alt={ALT} />);
    await user.click(trigger());
    const frame = document.querySelector('[data-slot="image-zoom-frame"]');

    if (!(frame instanceof HTMLElement)) throw new Error('no frame');

    // As Firefox does for a pointer it does not count as active: the capture throws.
    const capture = vi.spyOn(frame, 'setPointerCapture').mockImplementation(() => {
      throw new DOMException('Element.setPointerCapture: Invalid pointer id', 'NotFoundError');
    });

    await user.pointer({ keys: '[MouseLeft>]', target: frame });

    // Precondition: the capture was attempted, and threw.
    expect(capture).toHaveBeenCalled();
    expect(document.querySelector('[data-slot="image-zoom-full"][data-zoomed]')).not.toBeNull();
  });

  describe('never stays zoomed once the button is up, even when the release is lost', () => {
    /** Opens the image and holds the left button on it. */
    async function held() {
      device(true);
      const user = userEvent.setup();

      render(<ImageZoom labels={LABELS} src={SRC} alt={ALT} />);
      await user.click(trigger());
      const frame = document.querySelector('[data-slot="image-zoom-frame"]');

      if (!(frame instanceof HTMLElement)) throw new Error('no frame');

      await user.pointer({ keys: '[MouseLeft>]', target: frame });
      // Precondition: zoomed, so that a no-op cannot pass.
      expect(zoomed()).toBe(true);

      return { user, frame };
    }
    const zoomed = (): boolean => document.querySelector('[data-slot="image-zoom-full"][data-zoomed]') !== null;

    it('a move with no button pressed (the release happened elsewhere) returns it', async () => {
      const { frame } = await held();

      act(() => {
        frame.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', buttons: 0 }));
      });
      expect(zoomed()).toBe(false);
    });

    it('the context menu (a right click, or Ctrl + click on a Mac) returns it', async () => {
      const { frame } = await held();

      act(() => {
        frame.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      });
      expect(zoomed()).toBe(false);
    });

    it('the window losing focus (switching apps while holding) returns it', async () => {
      await held();
      act(() => {
        window.dispatchEvent(new Event('blur'));
      });
      expect(zoomed()).toBe(false);
    });

    it('Ctrl + click (the Mac context menu) never starts it', async () => {
      device(true);
      const user = userEvent.setup();

      render(<ImageZoom labels={LABELS} src={SRC} alt={ALT} />);
      await user.click(trigger());
      const frame = document.querySelector('[data-slot="image-zoom-frame"]');

      if (!(frame instanceof HTMLElement)) throw new Error('no frame');

      await user.keyboard('{Control>}');
      await user.pointer({ keys: '[MouseLeft>]', target: frame });
      expect(zoomed()).toBe(false);
    });
  });

  it('has no text of its own: only its labels and the alt', async () => {
    device(true);
    const user = userEvent.setup();

    render(<ImageZoom labels={LABELS} src={SRC} alt={ALT} />);
    expect(trigger().textContent).toBe('');
    await user.click(trigger());
    expect(screen.getByRole('dialog').textContent).toBe(ALT);
  });
});
