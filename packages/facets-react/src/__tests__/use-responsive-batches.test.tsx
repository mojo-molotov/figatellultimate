// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useResponsiveBatches } from '../index.js';

function Harness({
  batchUrls,
  load,
}: {
  readonly batchUrls: readonly string[];
  readonly load: (url: string) => Promise<readonly string[]>;
}) {
  // Destructured: the React Compiler's lint reads any member of an object holding a ref as a ref access.
  const { phone, page, activeDesktopBatch, loadedScrollBatches, hasMoreScroll, sentinelRef, selectPage, prefetchPage } =
    useResponsiveBatches({ batchUrls, load });

  return (
    <div>
      <span data-testid="mode">{phone ? 'phone' : 'desktop'}</span>
      <span data-testid="page">{String(page)}</span>
      <span data-testid="desktop-items">{(activeDesktopBatch ?? []).join(',')}</span>
      <span data-testid="scroll-items">{loadedScrollBatches.flat().join(',')}</span>
      <span data-testid="more">{String(hasMoreScroll)}</span>
      <button
        type="button"
        onClick={() => {
          selectPage(2);
        }}
      >
        page2
      </button>
      <button
        type="button"
        onClick={() => {
          prefetchPage(3);
        }}
      >
        prefetch3
      </button>
      {hasMoreScroll ? <div ref={sentinelRef} data-testid="sentinel" /> : null}
    </div>
  );
}

const BATCHES: Readonly<Record<string, readonly string[]>> = {
  '/batches/1': ['e', 'f'],
  '/batches/2': ['g'],
};

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches,
      media: '(max-width: 36rem)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useResponsiveBatches', () => {
  it('stays off scroll-loading on desktop and loads batches on demand via selectPage and prefetchPage', async () => {
    stubMatchMedia(false);
    const load = vi.fn((url: string) => Promise.resolve(BATCHES[url] ?? []));

    render(<Harness batchUrls={['/batches/1', '/batches/2']} load={load} />);
    expect(screen.getByTestId('mode').textContent).toBe('desktop');
    expect(screen.getByTestId('more').textContent).toBe('false');
    expect(load).not.toHaveBeenCalled();

    act(() => {
      screen.getByRole('button', { name: 'page2' }).click();
    });
    await waitFor(() => {
      expect(screen.getByTestId('desktop-items').textContent).toBe('e,f');
    });
    expect(screen.getByTestId('page').textContent).toBe('2');

    act(() => {
      screen.getByRole('button', { name: 'prefetch3' }).click();
    });
    await waitFor(() => {
      expect(load).toHaveBeenCalledWith('/batches/2');
    });
    expect(screen.getByTestId('page').textContent).toBe('2');
  });

  it('appends batches sequentially on a phone viewport as the sentinel intersects', async () => {
    stubMatchMedia(true);
    let callback: IntersectionObserverCallback | undefined;

    class StubObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = '200px';
      readonly scrollMargin = '0px';
      readonly thresholds = [0];

      constructor(cb: IntersectionObserverCallback) {
        callback = cb;
      }

      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }

    vi.stubGlobal('IntersectionObserver', StubObserver);
    const load = vi.fn((url: string) => Promise.resolve(BATCHES[url] ?? []));

    render(<Harness batchUrls={['/batches/1', '/batches/2']} load={load} />);
    await waitFor(() => {
      expect(screen.getByTestId('mode').textContent).toBe('phone');
    });
    expect(screen.getByTestId('more').textContent).toBe('true');

    // Desktop pagination prefetch must stay a no-op on phones and never populate scroll batches.
    act(() => {
      screen.getByRole('button', { name: 'prefetch3' }).click();
    });
    expect(load).not.toHaveBeenCalled();
    expect(screen.getByTestId('scroll-items').textContent).toBe('');

    const trigger = (): void => {
      act(() => {
        callback?.(
          [
            {
              isIntersecting: true,
              intersectionRatio: 1,
              target: document.createElement('div'),
              boundingClientRect: new DOMRect(),
              intersectionRect: new DOMRect(),
              rootBounds: null,
              time: 0,
            },
          ],
          new StubObserver(() => undefined),
        );
      });
    };

    trigger();
    await waitFor(() => {
      expect(screen.getByTestId('scroll-items').textContent).toBe('e,f');
    });
    trigger();
    await waitFor(() => {
      expect(screen.getByTestId('scroll-items').textContent).toBe('e,f,g');
      expect(screen.getByTestId('more').textContent).toBe('false');
    });
  });
});
