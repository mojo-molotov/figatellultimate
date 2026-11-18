// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
