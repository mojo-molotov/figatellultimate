// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Sparkles } from '../sparkles.js';

afterEach(() => {
  cleanup();
});

describe('Sparkles', () => {
  it('is decorative: a canvas hidden from assistive technologies, with no text', () => {
    const { container } = render(<Sparkles />);
    const canvas = container.querySelector('canvas');

    expect(canvas?.dataset['slot']).toBe('sparkles');
    expect(canvas?.getAttribute('aria-hidden')).toBe('true');
    expect(canvas?.textContent).toBe('');
  });

  it('mounts and unmounts without a 2D context (happy-dom has none): nothing drawn, nothing left running', () => {
    const { unmount } = render(<Sparkles />);

    expect(() => {
      unmount();
    }).not.toThrow();
  });
});

describe('Sparkles, under a burst of resizes', () => {
  // The browser's edges: a 2D context that draws nothing, the canvas's box, and a ResizeObserver fired by hand.
  const context = {
    setTransform: (): void => undefined,
    clearRect: (): void => undefined,
    beginPath: (): void => undefined,
    arc: (): void => undefined,
    fill: (): void => undefined,
    fillStyle: '',
    globalAlpha: 1,
  };
  let box = 1000;
  let resized: (() => void)[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    box = 1000;
    resized = [];
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => context });
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, get: () => box });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized.push(callback);
        }

        observe(): void {
          // Fired by hand.
        }

        disconnect(): void {
          // Nothing to release.
        }
      },
    );
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(HTMLCanvasElement.prototype, 'getContext');
    Reflect.deleteProperty(HTMLCanvasElement.prototype, 'clientWidth');
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const resize = (width: number): void => {
    box = width;
    act(() => {
      for (const callback of resized) callback();
    });
  };

  it('sizes the canvas on the first resize at once, on the others once they settle, the last size included', () => {
    const { container } = render(<Sparkles />);
    const canvas = container.querySelector('canvas');

    expect(canvas?.width).toBe(1000);
    resize(1200);

    expect(canvas?.width).toBe(1200);

    for (const width of [1300, 1400, 1500, 1600]) resize(width);

    // Throttled: the burst is not drawn yet.
    expect(canvas?.width).toBe(1200);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(canvas?.width).toBe(1600);
  });

  it('unmounted while a resize is pending: it never runs, nothing starts again', () => {
    const { container, unmount } = render(<Sparkles />);
    const canvas = container.querySelector('canvas');

    resize(1200);
    resize(1600);
    unmount();
    vi.advanceTimersByTime(1000);

    expect(canvas?.width).toBe(1200);
    expect(vi.getTimerCount()).toBe(0);
  });
});
