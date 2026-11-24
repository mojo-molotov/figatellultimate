import { describe, expect, it } from 'vitest';

import { tapToClose, within } from '../index.js';

describe('tapToClose', () => {
  it('cancels the click of a tap that pressed on the trigger, once', () => {
    const dismissal = tapToClose(800);

    dismissal.pressedOutside(true, 1000);
    expect(dismissal.click(1100)).toBe(true);
    // The next click is a new one: it opens the popup.
    expect(dismissal.click(1200)).toBe(false);
  });

  it.each([
    ['a press elsewhere', false, 1100],
    ['a click a tap’s time later', true, 1900],
  ])('never cancels after %s', (_, onTrigger, clickAt) => {
    const dismissal = tapToClose(800);

    dismissal.pressedOutside(onTrigger, 1000);
    expect(dismissal.click(clickAt)).toBe(false);
  });

  it('never cancels a click without a press before it', () => {
    expect(tapToClose().click(0)).toBe(false);
  });
});

describe('within', () => {
  const box = { left: 10, right: 50, top: 20, bottom: 40 };

  it.each([
    [{ x: 10, y: 20 }, true],
    [{ x: 50, y: 40 }, true],
    [{ x: 30, y: 30 }, true],
    [{ x: 9, y: 30 }, false],
    [{ x: 30, y: 41 }, false],
  ])('tells whether %j lies within the box, its edges included', (point, inside) => {
    expect(within(point, box)).toBe(inside);
  });

  it('holds no point in an empty box (an element not laid out)', () => {
    expect(within({ x: 0, y: 0 }, { left: 0, right: 0, top: 0, bottom: 0 })).toBe(false);
  });
});
