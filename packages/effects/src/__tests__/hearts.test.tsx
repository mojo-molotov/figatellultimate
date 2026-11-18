// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react';
import * as fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HEARTS, Hearts, nextHeart } from '../hearts.js';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

const shown = (container: HTMLElement): string | null | undefined =>
  container.querySelector('[data-state="shown"]')?.textContent;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('nextHeart', () => {
  it('always gives another heart of the list', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...HEARTS),
        fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }),
        (current, random) => {
          const next = nextHeart(HEARTS, current, random);

          expect(next).not.toBe(current);
          expect(HEARTS).toContain(next);
        },
      ),
    );
  });

  it('keeps the only heart there is', () => {
    expect(nextHeart(['❤️'], '❤️', 0.5)).toBe('❤️');
  });
});

describe('Hearts', () => {
  it('starts with the first heart, both slots hidden from assistive technologies, the label read instead', () => {
    const { container } = render(<Hearts label="love" />);

    expect(shown(container)).toBe('❤️');
    expect(container.querySelectorAll('[data-state="shown"]')).toHaveLength(1);

    for (const heart of container.querySelectorAll('[data-slot="heart"]'))
      expect(heart.getAttribute('aria-hidden')).toBe('true');

    expect(container.querySelector('[data-slot="hearts-label"]')?.textContent).toBe('love');
  });

  it('changes heart every `every` milliseconds, never to the same one, one shown at a time', () => {
    const { container } = render(<Hearts label="love" every={1000} />);
    let previous = shown(container);

    for (let change = 0; change < 20; change++) {
      act(() => {
        vi.advanceTimersByTime(999);
      });
      expect(shown(container)).toBe(previous);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      const current = shown(container);

      expect(current).not.toBe(previous);
      expect(container.querySelectorAll('[data-state="shown"]')).toHaveLength(1);
      previous = current;
    }
  });

  it('stops its timer once unmounted', () => {
    const { unmount } = render(<Hearts label="love" every={1000} />);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
