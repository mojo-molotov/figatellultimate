// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Effects } from '../effects.js';

const POINTER = '(hover: hover) and (pointer: fine)';
const WIDE = `${POINTER} and (min-width: 64rem)`;

/** A media query list the test switches, as a mouse plugged in or a window resized would. */
class Media extends EventTarget implements MediaQueryList {
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

/** The device: whether it has a mouse, and room for margins. */
function device({ pointer, wide }: { readonly pointer: boolean; readonly wide: boolean }): Record<string, Media> {
  const queries: Record<string, Media> = { [POINTER]: new Media(pointer, POINTER), [WIDE]: new Media(wide, WIDE) };
  const real = window.matchMedia.bind(window);

  vi.spyOn(window, 'matchMedia').mockImplementation((media) => queries[media] ?? real(media));

  return queries;
}

const slot = (name: string): Element | null => document.querySelector(`[data-slot="${name}"]`);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Effects', () => {
  it('renders nothing without a mouse: no glow, no sparkles, nothing fetched', async () => {
    device({ pointer: false, wide: false });
    render(<Effects />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(slot('cursor-glow')).toBeNull();
    expect(slot('sparkles')).toBeNull();
  });

  it('loads the glow with a mouse, and the sparkles only with room for margins too', async () => {
    const queries = device({ pointer: true, wide: false });

    render(<Effects />);
    await vi.waitFor(() => {
      expect(slot('cursor-glow')).not.toBeNull();
    });
    expect(slot('sparkles')).toBeNull();
    act(() => {
      queries[WIDE]?.switch(true);
    });
    await vi.waitFor(() => {
      expect(slot('sparkles')).not.toBeNull();
    });
  });

  it('follows the device: unplugging the mouse removes the glow', async () => {
    const queries = device({ pointer: true, wide: false });

    render(<Effects />);
    await vi.waitFor(() => {
      expect(slot('cursor-glow')).not.toBeNull();
    });
    act(() => {
      queries[POINTER]?.switch(false);
    });
    expect(slot('cursor-glow')).toBeNull();
  });
});
