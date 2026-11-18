// @vitest-environment happy-dom
// The glow's conditions, with the stylesheet: only a real browser computes them (`pnpm test:browser`).
import '../styles.css';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CursorGlow } from '../cursor-glow.js';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

const inBrowser = !navigator.userAgent.includes('HappyDOM');

afterEach(() => {
  cleanup();
});

describe('CursorGlow, styled', () => {
  it.skipIf(!inBrowser)('shows with a mouse, behind the content, never catching a click', () => {
    // Preconditions: a mouse, motion allowed (the glow's other conditions).
    expect(matchMedia('(hover: hover) and (pointer: fine)').matches).toBe(true);
    expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(false);
    render(<CursorGlow data-visible="" />);
    const glow = document.querySelector('[data-slot="cursor-glow"]');

    if (!(glow instanceof HTMLElement)) throw new Error('no glow');

    const style = getComputedStyle(glow);

    expect(style.display).toBe('block');
    expect(style.position).toBe('fixed');
    expect(style.pointerEvents).toBe('none');
    expect(Number(style.zIndex)).toBeLessThan(0);
  });
});
