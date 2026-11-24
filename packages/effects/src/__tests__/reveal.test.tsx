// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Reveal } from '../reveal.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Reveal', () => {
  it('holds its content in the sliding slot, inside the clipping one, adding nothing to it', () => {
    render(
      <Reveal>
        <footer>made with love</footer>
      </Reveal>,
    );
    const footer = screen.getByRole('contentinfo');

    expect(footer.parentElement?.dataset['slot']).toBe('reveal-content');
    expect(footer.parentElement?.parentElement?.dataset['slot']).toBe('reveal');
    expect(footer.parentElement?.parentElement?.textContent).toBe('made with love');
  });

  it.each([
    ['below the screen before any scroll: revealed', 2000, true],
    ['on the screen before any scroll: in its place', 300, false],
  ])('measures where it starts, %s', (_, top, revealing) => {
    // The page's layout, as a browser computes it: the slot's top before any scroll.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ y: top, height: 200 }));
    render(
      <Reveal>
        <footer>made with love</footer>
      </Reveal>,
    );

    expect(screen.getByRole('contentinfo').closest('[data-slot="reveal"]')?.hasAttribute('data-revealing')).toBe(
      revealing,
    );
  });
});

describe('Reveal, under a burst of resizes', () => {
  let top = 300;
  let measures = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    top = 300;
    // The page's layout, as a browser computes it: the slot's top before any scroll, changing with the screen.
    measures = 0;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => {
      measures += 1;

      return DOMRect.fromRect({ y: top, height: 200 });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const revealing = (): boolean | undefined =>
    screen.getByRole('contentinfo').closest('[data-slot="reveal"]')?.hasAttribute('data-revealing');

  it('measures the first resize at once, the others once they settle, the last layout included', () => {
    render(
      <Reveal>
        <footer>made with love</footer>
      </Reveal>,
    );

    expect(revealing()).toBe(false);
    top = 2000;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(revealing()).toBe(true);
    top = 300;
    act(() => {
      for (let index = 0; index < 20; index += 1) window.dispatchEvent(new Event('resize'));
    });

    // Throttled: the burst is not measured yet.
    expect(revealing()).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(revealing()).toBe(false);
  });

  it('unmounted while a measure is pending: it never runs', () => {
    const { unmount } = render(
      <Reveal>
        <footer>made with love</footer>
      </Reveal>,
    );

    act(() => {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('resize'));
    });
    unmount();
    const measured = measures;

    vi.advanceTimersByTime(1000);

    expect(measures).toBe(measured);
  });
});
