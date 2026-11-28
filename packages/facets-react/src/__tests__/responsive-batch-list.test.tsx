// @vitest-environment happy-dom
import type { UrlAdapter } from '@figatellultimate/facets';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BatchPagination, ResponsiveBatchList } from '../index.js';

interface TestItem {
  readonly id: string;
  readonly label: string;
}

const INITIAL = [
  { key: '1', node: <span>Item 1</span> },
  { key: '2', node: <span>Item 2</span> },
];
const BATCHES: Readonly<Record<string, readonly TestItem[]>> = {
  '/batches/1': [
    { id: '3', label: 'Item 3' },
    { id: '4', label: 'Item 4' },
  ],
  '/batches/2': [{ id: '5', label: 'Item 5' }],
};
const SELECT_LABELS = {
  trigger: 'Go to page',
  current: (page: number, pages: number) => `${String(page)} / ${String(pages)}`,
};
const PAGINATION_LABELS = {
  nav: 'Pagination',
  previous: 'Previous',
  next: 'Next',
  page: (page: number) => `Page ${String(page)}`,
  current: (page: number, pages: number) => `Page ${String(page)} of ${String(pages)}`,
  more: (hidden: readonly number[]) => `Pages ${String(hidden[0] ?? 0)}–${String(hidden.at(-1) ?? 0)}`,
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

function Demo({ load }: { readonly load: (url: string) => Promise<readonly TestItem[]> }) {
  const [search, setSearch] = useState('');
  const url: UrlAdapter = {
    search,
    navigate: (next) => {
      setSearch(next);
    },
  };

  return (
    <ResponsiveBatchList
      initial={INITIAL}
      batchUrls={['/batches/1', '/batches/2']}
      load={load}
      renderItem={(item) => ({ key: item.id, node: <span>{item.label}</span> })}
      renderPagination={({ onPageChange, onPrefetchPage }) => (
        <BatchPagination
          totalItems={5}
          batchSize={2}
          url={url}
          locale="en"
          onPageChange={onPageChange}
          onPrefetchPage={onPrefetchPage}
          selectLabels={SELECT_LABELS}
          paginationLabels={PAGINATION_LABELS}
        />
      )}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ResponsiveBatchList and BatchPagination', () => {
  it('renders initial items and switches batches via BatchPagination on desktop without mounting a scroll sentinel', async () => {
    stubMatchMedia(false);
    const load = vi.fn((url: string) => Promise.resolve(BATCHES[url] ?? []));
    const { container } = render(<Demo load={load} />);

    expect(screen.getByText('Item 1')).toBeDefined();
    expect(screen.getByText('Item 2')).toBeDefined();
    expect(container.querySelector('[data-slot="section-list-status"]')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Go to page' })).toBeDefined();
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeDefined();

    await userEvent.click(screen.getByRole('link', { name: 'Next' }));
    await waitFor(() => {
      expect(screen.getByText('Item 3')).toBeDefined();
      expect(screen.getByText('Item 4')).toBeDefined();
    });
    expect(screen.queryByText('Item 1')).toBeNull();
  });

  it('unmounts pagination on phones and reveals batches sequentially on scroll', async () => {
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
    const { container } = render(<Demo load={load} />);

    await waitFor(() => {
      expect(screen.queryByRole('navigation', { name: 'Pagination' })).toBeNull();
    });
    expect(load).not.toHaveBeenCalled();
    expect(container.querySelector('[data-slot="section-list-status"]')).not.toBeNull();

    const intersect = (): void => {
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

    intersect();
    await waitFor(() => {
      expect(screen.getByText('Item 3')).toBeDefined();
      expect(screen.getByText('Item 1')).toBeDefined();
    });

    intersect();
    await waitFor(() => {
      expect(screen.getByText('Item 5')).toBeDefined();
      expect(container.querySelector('[data-slot="section-list-status"]')).toBeNull();
    });
  });

  it('keeps pagination mounted on phones when landed on page 2 and navigates locally back to page 1 via firstBatchUrl', async () => {
    stubMatchMedia(true);
    const load = vi.fn((url: string) =>
      Promise.resolve(
        url === '/batches/0'
          ? [
              { id: '1', label: 'Item 1' },
              { id: '2', label: 'Item 2' },
            ]
          : (BATCHES[url] ?? []),
      ),
    );
    const calls: { readonly search: string; readonly local: boolean | undefined }[] = [];

    function Page2Demo() {
      const [search, setSearch] = useState('?page=2');
      const url: UrlAdapter = {
        search,
        navigate: (next, options) => {
          calls.push({ search: next, local: options.local });
          setSearch(next);
        },
      };

      return (
        <ResponsiveBatchList
          initial={[
            { key: '3', node: <span>Item 3</span> },
            { key: '4', node: <span>Item 4</span> },
          ]}
          initialPage={2}
          firstBatchUrl="/batches/0"
          batchUrls={['/batches/1', '/batches/2']}
          load={load}
          renderItem={(item) => ({ key: item.id, node: <span>{item.label}</span> })}
          renderPagination={({ onPageChange, onPrefetchPage }) => (
            <BatchPagination
              totalItems={5}
              batchSize={2}
              url={url}
              locale="en"
              onPageChange={onPageChange}
              onPrefetchPage={onPrefetchPage}
              selectLabels={SELECT_LABELS}
              paginationLabels={PAGINATION_LABELS}
            />
          )}
        />
      );
    }

    const { container } = render(<Page2Demo />);

    expect(screen.getByText('Item 3')).toBeDefined();
    expect(container.querySelector('[data-slot="section-list-status"]')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeDefined();

    await userEvent.click(screen.getByRole('link', { name: 'Previous' }));
    await waitFor(() => {
      expect(screen.getByText('Item 1')).toBeDefined();
    });
    expect(load).toHaveBeenCalledWith('/batches/0');
    expect(calls).toEqual([{ search: '', local: true }]);
  });
});
