// @vitest-environment happy-dom
import { defineFacetedCollection, type Engine, type UrlAdapter } from '@figatellultimate/facets';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createIndexLoader, usePagedCollection, type PagedSlice } from '../index.js';

interface Post {
  readonly url: string;
  readonly date: string;
  readonly tags: readonly string[];
}

// 12 posts, five a page: three pages. Only the last ones carry `harp`, absent from the first page's slice.
const POSTS: readonly Post[] = Array.from({ length: 12 }, (_, i) => ({
  url: `/p/${String(i).padStart(2, '0')}`,
  date: `2026-10-${String(30 - i).padStart(2, '0')}`,
  tags: i >= 10 ? ['harp'] : ['bot'],
}));
const engineOf = (items: readonly Post[]): Engine<Post> =>
  defineFacetedCollection<Post>({
    items,
    key: (post) => post.url,
    facets: { tags: { values: (post) => post.tags } },
    sorts: { 'date-desc': (a, b) => (a.date < b.date ? 1 : -1), 'date-asc': (a, b) => (a.date < b.date ? -1 : 1) },
    perPage: 5,
  });
const SLICE = POSTS.slice(0, 5);
const PAGED: PagedSlice = { page: 1, pages: 3, total: 12 };

/** An index as the server writes it: every post, and whatever else the app adds (its cards). */
interface Index {
  readonly items: readonly Post[];
  readonly cards: Readonly<Record<string, string>>;
}

const INDEX: Index = { items: POSTS, cards: Object.fromEntries(POSTS.map((post) => [post.url, `card ${post.url}`])) };

/** The hook over an in-memory URL: `navigated` records each navigation, `load` counts the index's fetches. */
function setup(search: string, options: { readonly paged?: PagedSlice; readonly fail?: boolean } = {}) {
  const navigated: { readonly search: string; readonly mode: string }[] = [];
  const prefetched: string[] = [];
  let resolve: (index: Index) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const load = vi.fn(
    () =>
      new Promise<Index>((res, rej) => {
        resolve = res;
        reject = rej;
      }),
  );
  const at = { search };
  const url = (): UrlAdapter => ({
    search: at.search,
    navigate(next, { mode }) {
      navigated.push({ search: next, mode });
      at.search = next;
    },
    prefetch(next) {
      prefetched.push(next);
    },
  });
  const hook = renderHook(
    ({ adapter }: { readonly adapter: UrlAdapter }) =>
      usePagedCollection({
        engine: engineOf,
        items: options.paged === undefined ? POSTS : SLICE,
        paged: options.paged,
        load,
        url: adapter,
      }),
    { initialProps: { adapter: url() } },
  );

  return {
    ...hook,
    navigated,
    prefetched,
    load,
    /** The URL changed: the hook reads it again, as a router would make it. */
    follow: () => {
      hook.rerender({ adapter: url() });
    },
    arrive: async (index: Index = INDEX) => {
      await act(async () => {
        resolve(index);
        await Promise.resolve();
      });
    },
    fail: async () => {
      await act(async () => {
        reject(new Error('offline'));
        await Promise.resolve();
      });
    },
  };
}

describe('usePagedCollection', () => {
  it('with every item at hand, computes every view at once and never loads', () => {
    const { result, load } = setup('?tags=harp');

    expect(result.current.binding.view.keys).toEqual(['/p/10', '/p/11']);
    expect(load).not.toHaveBeenCalled();
  });

  it("shows the page's own slice, its pages and its total from the server, without loading", () => {
    const { result, load } = setup('', { paged: PAGED });

    expect(result.current.binding.view).toMatchObject({ keys: SLICE.map((post) => post.url), total: 12, pages: 3 });
    expect(result.current.index).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });

  it('reaches another default page by the URL alone, the index never loaded', () => {
    const { result, navigated, load } = setup('', { paged: PAGED });

    act(() => {
      result.current.binding.dispatch({ type: 'page', page: 3 });
    });
    expect(navigated).toEqual([{ search: '?page=3', mode: 'push' }]);
    expect(load).not.toHaveBeenCalled();
  });

  it('loads a default page ahead by its URL alone, a selection asking for nothing but the index', () => {
    const { result, prefetched, load } = setup('', { paged: PAGED });

    result.current.binding.prefetchFor({ type: 'page', page: 3 });
    result.current.binding.prefetchFor({ type: 'toggle', facet: 'tags', value: 'harp' });
    expect(prefetched).toEqual(['?page=3']);
    expect(load).not.toHaveBeenCalled();
  });

  it('loads the index for a selection in the URL, even of a term the slice lacks, then shows it', async () => {
    const { result, load, arrive } = setup('?tags=harp', { paged: PAGED });

    // Precondition: no post of the slice has the term.
    expect(SLICE.some((post) => post.tags.includes('harp'))).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
    // While it loads: no card of the unselected list, and no page of it to reach.
    expect(result.current.binding.view).toMatchObject({ keys: [], pages: 1 });
    await arrive();
    expect(result.current.binding.view.keys).toEqual(['/p/10', '/p/11']);
    expect(result.current.index?.cards['/p/10']).toBe('card /p/10');
  });

  it('keeps a filter chosen before the index, and applies it once the index is here', async () => {
    const { result, navigated, load, arrive, follow } = setup('', { paged: PAGED });

    act(() => {
      result.current.binding.dispatch({ type: 'toggle', facet: 'tags', value: 'harp' });
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(navigated).toEqual([]);
    await arrive();
    expect(navigated).toEqual([{ search: '?tags=harp', mode: 'replace' }]);
    follow();
    expect(result.current.binding.view.keys).toEqual(['/p/10', '/p/11']);
  });

  it('prefetches once, as the reader heads for a filter', async () => {
    const { result, load, arrive } = setup('', { paged: PAGED });

    act(() => {
      result.current.prefetch();
      result.current.prefetch();
    });
    expect(load).toHaveBeenCalledTimes(1);
    await arrive();
    act(() => {
      result.current.prefetch();
    });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('returns a failed load as a value, and loads again on the next prefetch', async () => {
    const { result, load, fail } = setup('', { paged: PAGED });

    act(() => {
      result.current.prefetch();
    });
    await fail();
    expect(result.current.error).toBeInstanceOf(Error);
    // The page's slice stays: a failed index never empties the list.
    expect(result.current.binding.view.keys).toEqual(SLICE.map((post) => post.url));
    act(() => {
      result.current.prefetch();
    });
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('createIndexLoader', () => {
  const response = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

  it('fetches each URL once, its body checked by the parser', async () => {
    const fetch = vi.fn(() => response({ items: [1, 2] }));
    const parse = vi.fn((json: unknown) => {
      if (typeof json !== 'object' || json === null || !('items' in json)) throw new TypeError('no items');

      return json;
    });
    const load = createIndexLoader(parse, { fetch });

    expect(await load('/listing/a')).toEqual({ items: [1, 2] });
    expect(await load('/listing/a')).toEqual({ items: [1, 2] });
    await load('/listing/b');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['answers an error status', () => response({}, 404), /404/],
    ['does not match the parser', () => response({ nothing: true }), /no items/],
  ])('rejects an index that %s, and fetches it again next time', async (_, answer, message) => {
    const fetch = vi.fn(answer);
    const load = createIndexLoader(
      (json: unknown) => {
        if (typeof json !== 'object' || json === null || !('items' in json)) throw new TypeError('no items');

        return json;
      },
      { fetch },
    );

    await expect(load('/listing/a')).rejects.toThrow(message);
    await expect(load('/listing/a')).rejects.toThrow(message);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('usePagedCollection: batches', () => {
  // 60 posts, five a page: twelve pages; batches of five pages (1–5, 6–10, 11–12).
  const MANY: readonly Post[] = Array.from({ length: 60 }, (_, i) => ({
    url: `/m/${String(i).padStart(2, '0')}`,
    date: `2026-${String(12 - Math.floor(i / 28)).padStart(2, '0')}-${String(28 - (i % 28)).padStart(2, '0')}`,
    tags: ['bot'],
  }));
  const keysOf = (from: number, to: number): string[] => MANY.slice((from - 1) * 5, to * 5).map((post) => post.url);

  /** A listing on a page, its batches loaded by a recorder; the address as an in-memory URL. */
  function batched(
    page: number,
    options: { readonly batches?: boolean; readonly index?: boolean; readonly search?: string } = {},
  ) {
    const navigated: { readonly search: string; readonly mode: string; readonly local: boolean }[] = [];
    const prefetched: string[] = [];
    const asked: number[] = [];
    const at = { search: options.search ?? (page === 1 ? '' : `?page=${String(page)}`) };
    const url = (): UrlAdapter => ({
      search: at.search,
      navigate(next, { mode, local }) {
        navigated.push({ search: next, mode, local: local === true });
        at.search = next;
      },
      prefetch(next) {
        prefetched.push(next);
      },
    });
    const batches = {
      size: 5,
      load: (from: number) => {
        asked.push(from);

        return Promise.resolve({ keys: keysOf(from, Math.min(12, from + 4)) });
      },
    };
    const hook = renderHook(
      ({ adapter }: { readonly adapter: UrlAdapter }) =>
        usePagedCollection({
          engine: engineOf,
          items: MANY.slice((page - 1) * 5, page * 5),
          paged: { page, pages: 12, total: 60, perPage: 5 },
          ...(options.index === false ? {} : { load: () => Promise.resolve({ items: MANY }) }),
          url: adapter,
          ...(options.batches === false ? {} : { batches }),
        }),
      { initialProps: { adapter: url() } },
    );

    return {
      ...hook,
      navigated,
      prefetched,
      asked,
      follow: () => {
        hook.rerender({ adapter: url() });
      },
      /** Idle, then the batches' answers. */
      settle: async () => {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 300));
        });
      },
    };
  }

  it('without an index, shows its pages from its batches, a selection in the URL read as the default view', async () => {
    // A folder of folders: nothing to filter, so no index; a query it never writes changes nothing.
    const { result, navigated, settle, follow } = batched(2, { index: false, search: '?page=2&tags=harp' });

    expect(result.current.binding.view).toMatchObject({ keys: keysOf(2, 2), pages: 12 });
    await settle();
    act(() => {
      result.current.binding.dispatch({ type: 'page', page: 3 });
    });
    expect(navigated).toEqual([{ search: '?page=3', mode: 'push', local: true }]);
    follow();
    expect(result.current.binding.view.keys).toEqual(keysOf(3, 3));
    expect(result.current.index).toBeUndefined();
  });

  it('loads the current page’s batch on idle, and nothing more away from its edges', async () => {
    const { asked, settle } = batched(2);

    expect(asked).toEqual([]);
    await settle();
    expect(asked).toEqual([1]);
  });

  it('shows a page its batch holds without the server: only the address moves, its keys from the batch', async () => {
    const { result, navigated, settle, follow } = batched(2);

    await settle();
    act(() => {
      result.current.binding.dispatch({ type: 'page', page: 3 });
    });
    expect(navigated).toEqual([{ search: '?page=3', mode: 'push', local: true }]);
    follow();
    expect(result.current.binding.state.page).toBe(3);
    expect(result.current.binding.view.keys).toEqual(keysOf(3, 3));
  });

  it('reaches a page no loaded batch holds through the server, as without batches', async () => {
    const { result, navigated, settle } = batched(2);

    await settle();
    act(() => {
      result.current.binding.dispatch({ type: 'page', page: 9 });
    });
    expect(navigated).toEqual([{ search: '?page=9', mode: 'push', local: false }]);
  });

  it('loads the next batch as the reader nears the edge, and loads ahead no page a batch holds', async () => {
    const { result, asked, prefetched, settle, follow } = batched(2);

    await settle();
    act(() => {
      result.current.binding.dispatch({ type: 'page', page: 3 });
    });
    follow();
    await settle();
    // Page 3, within three pages of batch 1's end (5): batch 6 too.
    expect(asked).toEqual([1, 6]);
    prefetched.length = 0;
    result.current.binding.prefetchFor({ type: 'page', page: 7 });
    result.current.binding.prefetchFor({ type: 'page', page: 12 });
    // Page 7 is in a loaded batch: nothing to load ahead; page 12 is not: its prerendered page.
    expect(prefetched).toEqual(['?page=12']);
  });

  it('loads at once the batch of an address its props do not hold, and shows that page from it', async () => {
    const { result, asked, rerender, navigated } = batched(2);
    const restored: UrlAdapter = {
      search: '?page=4',
      navigate: (next, { mode }) => navigated.push({ search: next, mode, local: false }),
    };

    // Back on a history entry whose address is page 4, its props still page 2's (as Next restores a tree): no idle wait.
    rerender({ adapter: restored });
    // Its batch, and the next one, page 4 being within three pages of its end.
    expect(asked).toEqual([1, 6]);
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.binding.view.keys).toEqual(keysOf(4, 4));
    expect(navigated).toEqual([]);
  });

  it('shows every page here once the whole index is at hand, a filter having loaded it', async () => {
    const { result, navigated, settle } = batched(2);

    act(() => {
      result.current.prefetch();
    });
    await settle();
    // Precondition: the index is here.
    expect(result.current.index?.items).toHaveLength(60);
    act(() => {
      result.current.binding.dispatch({ type: 'page', page: 11 });
    });
    expect(navigated).toEqual([{ search: '?page=11', mode: 'push', local: true }]);
  });

  it('without batches, takes back to the server an address its props do not hold', () => {
    const { navigated, rerender } = batched(2, { batches: false });
    const moved: UrlAdapter = {
      search: '?page=4',
      navigate: (next, { mode }) => navigated.push({ search: next, mode, local: false }),
    };

    rerender({ adapter: moved });
    expect(navigated).toEqual([{ search: '?page=4', mode: 'replace', local: false }]);
  });
});
