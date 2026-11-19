// @vitest-environment happy-dom
import type { QueryOptions, Search, SearchPage, SearchResult } from '@figatellultimate/search';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { useSearch, type SearchBinding } from '../index.js';

// The hook's tests need React's act environment.

type Collection = 'blog' | 'pages';
const result = (i: number): SearchResult<Collection> => ({
  url: `/r/${String(i)}`,
  title: `R${String(i)}`,
  excerpt: '',
  meta: {},
  collection: 'blog',
});

/** A pending query of the controlled search: the test decides when, and with what, it resolves. */
interface Pending {
  readonly term: string;
  readonly options: QueryOptions<Collection> | undefined;
  readonly resolve: (page: SearchPage<Collection> | null) => void;
}

/** A `Search` whose queries resolve only when the test says so. */
function controlledSearch(): { search: Search<Collection>; pending: Pending[]; preloaded: string[] } {
  const pending: Pending[] = [];
  const preloaded: string[] = [];
  const search: Search<Collection> = {
    minLength: 3,
    query: (term, options) =>
      new Promise((resolve) => {
        pending.push({ term, options, resolve });
      }),
    preload: (term) => {
      preloaded.push(term);

      return Promise.resolve();
    },
  };

  return { search, pending, preloaded };
}

/** Pages of `total` results, `size` at a time, the way the client grows them. */
function pages(total: number, size: number, from = 0): SearchPage<Collection> {
  const results = Array.from({ length: Math.min(from + size, total) }, (_, i) => result(i));

  return {
    status: 'done',
    total,
    results,
    more: from + size < total ? () => Promise.resolve(pages(total, size, from + size)) : undefined,
  };
}

function mount(search: Search<Collection>, initial: string, options?: QueryOptions<Collection>) {
  let latest: SearchBinding<Collection> | undefined;
  let setTerm: (term: string) => void = () => undefined;

  function Probe(): null {
    const [term, set] = useState(initial);

    setTerm = set;
    // A new array on every render: the hook must not search again for an equal list.
    latest = useSearch(search, term, options === undefined ? undefined : { ...options });

    return null;
  }
  const root = createRoot(document.createElement('div'));

  act(() => {
    root.render(createElement(Probe));
  });

  return {
    binding: (): SearchBinding<Collection> => {
      if (latest === undefined) throw new Error('not rendered');

      return latest;
    },
    type: (term: string) => {
      act(() => {
        setTerm(term);
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

const settle = (pending: Pending, page: SearchPage<Collection> | null): Promise<void> =>
  act(async () => {
    pending.resolve(page);
    await Promise.resolve();
  });

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe('useSearch', () => {
  it('is idle for an empty term, and searches nothing', () => {
    const { search, pending } = controlledSearch();
    const view = mount(search, '   ');

    cleanups.push(view.unmount);
    expect(view.binding()).toEqual({ status: 'idle', results: [], total: 0, more: undefined });
    expect(pending).toEqual([]);
  });

  it('searches, then shows the first batch; more() appends the next one', async () => {
    const { search, pending, preloaded } = controlledSearch();
    const view = mount(search, 'release');

    cleanups.push(view.unmount);
    expect(view.binding().status).toBe('searching');
    expect(preloaded).toEqual(['release']);
    const [first] = pending;

    if (first === undefined) throw new Error('no query');

    await settle(first, pages(7, 5));
    expect(view.binding().status).toBe('done');
    expect(view.binding().total).toBe(7);
    expect(view.binding().results).toHaveLength(5);
    await act(async () => {
      view.binding().more?.();
      await Promise.resolve();
    });
    expect(view.binding().results).toHaveLength(7);
    expect(view.binding().more).toBeUndefined();
  });

  it('passes the collections, and does not search again for an equal list', async () => {
    const { search, pending } = controlledSearch();
    const view = mount(search, 'release', { collections: ['pages'] });

    cleanups.push(view.unmount);
    expect(pending.map((p) => p.options)).toEqual([{ collections: ['pages'], sort: 'relevance' }]);
    const [first] = pending;

    if (first === undefined) throw new Error('no query');

    await settle(first, pages(1, 5));
    expect(pending).toHaveLength(1);
  });

  it('searches at once when only the options change, after the quiet time when the term does', () => {
    const { search, pending } = controlledSearch();
    let setSort: (sort: 'relevance' | 'title-asc') => void = () => undefined;
    let setTerm: (term: string) => void = () => undefined;

    function Probe(): null {
      const [term, setT] = useState('release');
      const [sort, setS] = useState<'relevance' | 'title-asc'>('relevance');

      setSort = setS;
      setTerm = setT;
      useSearch(search, term, { sort });

      return null;
    }
    const root = createRoot(document.createElement('div'));

    act(() => {
      root.render(createElement(Probe));
    });
    cleanups.push(() => {
      act(() => {
        root.unmount();
      });
    });
    act(() => {
      setSort('title-asc');
    });
    act(() => {
      setTerm('releases');
    });
    expect(pending.map((p) => [p.term, p.options?.sort, p.options?.immediate])).toEqual([
      ['release', 'relevance', undefined],
      ['release', 'title-asc', true],
      ['releases', 'title-asc', undefined],
    ]);
  });

  it('ignores superseded queries: a late answer never replaces a newer one', async () => {
    const { search, pending } = controlledSearch();
    const view = mount(search, 'rel');

    cleanups.push(view.unmount);
    view.type('release');
    const [old, current] = pending;

    if (old === undefined || current === undefined) throw new Error('expected two queries');

    await settle(current, pages(2, 5));
    await settle(old, pages(9, 5));
    expect(view.binding().total).toBe(2);
    // The client answers null for a superseded query: nothing changes either.
    await settle(old, null);
    expect(view.binding().status).toBe('done');
  });

  it('keeps the previous results while a new query searches (no flicker)', async () => {
    const { search, pending } = controlledSearch();
    const view = mount(search, 'release');

    cleanups.push(view.unmount);
    const [first] = pending;

    if (first === undefined) throw new Error('no query');

    await settle(first, pages(3, 5));
    view.type('release notes');
    expect(view.binding().status).toBe('searching');
    expect(view.binding().results).toHaveLength(3);
  });

  it.each(['too-short', 'unavailable'] as const)('reports %s from the client, with no results', async (status) => {
    const { search, pending } = controlledSearch();
    const view = mount(search, 're');

    cleanups.push(view.unmount);
    const [first] = pending;

    if (first === undefined) throw new Error('no query');

    await settle(first, { status, total: 0, results: [], more: undefined });
    expect(view.binding()).toEqual({ status, results: [], total: 0, more: undefined });
  });

  it('clearing the term goes back to idle, and a late answer is ignored', async () => {
    const { search, pending } = controlledSearch();
    const view = mount(search, 'release');

    cleanups.push(view.unmount);
    view.type('');
    const [first] = pending;

    if (first === undefined) throw new Error('no query');

    await settle(first, pages(4, 5));
    expect(view.binding().status).toBe('idle');
    expect(view.binding().results).toEqual([]);
  });
});
