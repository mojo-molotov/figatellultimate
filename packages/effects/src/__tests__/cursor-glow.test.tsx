// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CursorGlow } from '../cursor-glow.js';

const glow = (): HTMLElement => {
  const element = document.querySelector('[data-slot="cursor-glow"]');

  if (!(element instanceof HTMLElement)) throw new Error('no glow');

  return element;
};

/** A pointer move, then the next frame, when the glow follows. */
async function move(pointerType: string, x: number, y: number): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new PointerEvent('pointermove', { pointerType, clientX: x, clientY: y }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

afterEach(() => {
  cleanup();
});

describe('CursorGlow', () => {
  it('is decorative: hidden from assistive technologies, no text of its own, forwarding its props', () => {
    render(<CursorGlow className="x" />);
    expect(glow().getAttribute('aria-hidden')).toBe('true');
    expect(glow().textContent).toBe('');
    expect(glow().className).toBe('x');
    expect(glow().hasAttribute('data-visible')).toBe(false);
  });

  it('follows the mouse once per frame, and shows from its first move', async () => {
    render(<CursorGlow />);
    await move('mouse', 120, 80);
    expect(glow().style.getPropertyValue('--glow-x')).toBe('120px');
    expect(glow().style.getPropertyValue('--glow-y')).toBe('80px');
    expect(glow().hasAttribute('data-visible')).toBe(true);
    await move('mouse', 300, 200);
    expect(glow().style.getPropertyValue('--glow-x')).toBe('300px');
  });

  it('ignores touch and pen: a mouse only', async () => {
    render(<CursorGlow />);
    await move('touch', 120, 80);
    await move('pen', 120, 80);
    expect(glow().hasAttribute('data-visible')).toBe(false);
    expect(glow().style.getPropertyValue('--glow-x')).toBe('');
  });

  it('stays hidden when the mouse leaves before it is shown, a move and its reveal still pending', async () => {
    render(<CursorGlow />);
    // A move, then the mouse out of the window at once: its place and its reveal are still waiting for their frames.
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', clientX: 120, clientY: 80 }));
      document.documentElement.dispatchEvent(new MouseEvent('mouseleave'));
    });
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    expect(glow().hasAttribute('data-visible')).toBe(false);
  });

  it('stays hidden when the mouse leaves between its place and its reveal', async () => {
    render(<CursorGlow />);
    // The place's frame runs, the reveal's is pending when the mouse leaves.
    await act(async () => {
      window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', clientX: 120, clientY: 80 }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      document.documentElement.dispatchEvent(new MouseEvent('mouseleave'));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    expect(glow().hasAttribute('data-visible')).toBe(false);
  });

  it('fades out when the mouse leaves the window', async () => {
    render(<CursorGlow />);
    await move('mouse', 120, 80);
    act(() => {
      document.documentElement.dispatchEvent(new MouseEvent('mouseleave'));
    });
    expect(glow().hasAttribute('data-visible')).toBe(false);
  });
});
