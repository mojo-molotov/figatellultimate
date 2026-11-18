// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Sparkles } from '../sparkles.js';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

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
