// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Collector } from '../collector.js';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

const box = (): HTMLElement => {
  const element = screen.getByText('card').parentElement;

  if (element === null) throw new Error('no collector');

  return element;
};

/** A pointer move over the card, then the next frame, when the light follows. */
async function move(pointerType: string, x: number, y: number): Promise<void> {
  await act(async () => {
    box().dispatchEvent(new PointerEvent('pointermove', { pointerType, clientX: x, clientY: y, bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

afterEach(() => {
  cleanup();
});

describe('Collector', () => {
  it('wraps its card in a collector slot', () => {
    render(
      <Collector>
        <p>card</p>
      </Collector>,
    );
    expect(box().dataset['slot']).toBe('collector');
  });

  it("places the light under the mouse, in the card's coordinates", async () => {
    render(
      <Collector>
        <p>card</p>
      </Collector>,
    );
    const { left, top } = box().getBoundingClientRect();

    await move('mouse', left + 40, top + 25);
    expect(box().style.getPropertyValue('--collector-x')).toBe('40px');
    expect(box().style.getPropertyValue('--collector-y')).toBe('25px');
  });

  it('ignores touch and pen: a mouse only', async () => {
    render(
      <Collector>
        <p>card</p>
      </Collector>,
    );
    await move('touch', 40, 25);
    await move('pen', 40, 25);
    expect(box().style.getPropertyValue('--collector-x')).toBe('');
  });
});
