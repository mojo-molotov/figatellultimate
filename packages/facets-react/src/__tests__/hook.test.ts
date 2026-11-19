// @vitest-environment happy-dom
import { defineFacetedCollection, type Engine, type UrlAdapter } from '@figatellultimate/facets';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { useFacetedCollection, useHistoryUrl, type FacetedCollectionBinding } from '../index.js';

// The hook's tests need React's act environment.
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

interface Post {
  readonly url: string;
  readonly date: string;
  readonly tags: readonly string[];
}
const POSTS: readonly Post[] = Array.from({ length: 12 }, (_, i) => ({
  url: `/p/${String(i).padStart(2, '0')}`,
  date: `2026-11-${String(i + 1).padStart(2, '0')}`,
  tags: i % 3 === 0 ? ['bot', 'release'] : [i % 3 === 1 ? 'release' : 'guide'],
}));
const engine: Engine<Post> = defineFacetedCollection<Post>({
  items: POSTS,
  key: (post) => post.url,
  facets: { tags: { values: (post) => post.tags } },
  sorts: {
    'date-desc': (a, b) => (a.date < b.date ? 1 : -1),
    'date-asc': (a, b) => (a.date < b.date ? -1 : 1),
  },
  perPage: 5,
});

/** Mounts the hook over an in-memory URL; returns the latest binding and the URL's history. */
function mount(
  initial: string,
  options?: Parameters<typeof useFacetedCollection>[2],
): { binding: () => FacetedCollectionBinding; history: string[]; modes: string[]; unmount: () => void } {
  const history: string[] = [];
  const modes: string[] = [];
  let latest: FacetedCollectionBinding | undefined;

  function Probe(): null {
    const [search, setSearch] = useState(initial);
    const url: UrlAdapter = {
      search,
      navigate(next, { mode }) {
        history.push(next);
        modes.push(mode);
        setSearch(next);
      },
    };

    latest = useFacetedCollection(engine, url, options);

    return null;
  }
  const root = createRoot(document.createElement('div'));

  act(() => {
    root.render(createElement(Probe));
  });

  return {
    binding: () => {
      if (latest === undefined) throw new Error('not rendered');

      return latest;
    },
    history,
    modes,
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe('useFacetedCollection', () => {
  it('reads the state from the URL and renders keys only', () => {
    const { binding, unmount } = mount('?page=2');

    cleanups.push(unmount);
    expect(binding().state.page).toBe(2);
    expect(binding().view.keys).toEqual(['/p/06', '/p/05', '/p/04', '/p/03', '/p/02']);
  });

  it('replays the reconciliation through the URL: select, then clear back to the remembered page', () => {
    const { binding, history, unmount } = mount('?page=3');

    cleanups.push(unmount);
    act(() => {
      binding().dispatch({ type: 'toggle', facet: 'tags', value: 'release' });
    });
    expect(history.at(-1)).toBe('?tags=release&page=2');
    expect(binding().state.remembered).toBe(3);
    act(() => {
      binding().dispatch({ type: 'clear' });
    });
    expect(history.at(-1)).toBe('?page=3');
  });

  it('a forged URL never breaks the view', () => {
    const { binding, unmount } = mount('?tags=%E0%A4%A&page=-1&sort=nope');

    cleanups.push(unmount);
    expect(binding().state).toEqual({ facets: { tags: [] }, sort: 'date-desc', page: 1 });
    expect(binding().view.keys).toHaveLength(5);
  });

  it('gives real hrefs for actions, the default state as "?"', () => {
    const { binding, unmount } = mount('?page=2');

    cleanups.push(unmount);
    expect(binding().hrefFor({ type: 'page', page: 3 })).toBe('?page=3');
    expect(binding().hrefFor({ type: 'page', page: 1 })).toBe('?');
  });

  it('never writes the remembered page in the URL', () => {
    const { binding, history, unmount } = mount('?page=3');

    cleanups.push(unmount);
    act(() => {
      binding().dispatch({ type: 'toggle', facet: 'tags', value: 'bot' });
    });
    expect(history.every((search) => !search.includes('remembered') && !search.includes('from'))).toBe(true);
  });
});

describe('useHistoryUrl', () => {
  it('a page change pushes a history entry, filters and sorts replace it', () => {
    const view = mount('');

    cleanups.push(view.unmount);
    act(() => {
      view.binding().dispatch({ type: 'page', page: 2 });
    });
    act(() => {
      view.binding().dispatch({ type: 'sort', sort: view.binding().sorts[1] ?? '' });
    });
    act(() => {
      view.binding().dispatch({ type: 'clear' });
    });
    expect(view.modes).toEqual(['push', 'replace', 'replace']);
  });

  it('the navigation mode can be set for every action, or per kind of action', () => {
    const everywhere = mount('', { mode: 'push' });

    cleanups.push(everywhere.unmount);
    act(() => {
      everywhere.binding().dispatch({ type: 'clear' });
    });
    expect(everywhere.modes).toEqual(['push']);
    const perKind = mount('', { mode: { page: 'replace', clear: 'push' } });

    cleanups.push(perKind.unmount);
    act(() => {
      perKind.binding().dispatch({ type: 'page', page: 2 });
    });
    act(() => {
      perKind.binding().dispatch({ type: 'clear' });
    });
    expect(perKind.modes).toEqual(['replace', 'push']);
  });

  it('the History API adapter replaces or pushes as asked, and follows Back', () => {
    window.history.replaceState(null, '', '/blog?page=2');
    let latest: UrlAdapter | undefined;

    function Probe(): null {
      latest = useHistoryUrl();

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
    expect(latest?.search).toBe('?page=2');
    const length = window.history.length;

    act(() => {
      latest?.navigate('?page=3', { mode: 'replace' });
    });
    expect(window.location.search).toBe('?page=3');
    expect(window.history.length).toBe(length);
    expect(latest?.search).toBe('?page=3');
    act(() => {
      latest?.navigate('?tags=bot', { mode: 'push' });
    });
    expect(window.history.length).toBe(length + 1);
    expect(window.location.pathname).toBe('/blog');
  });
});
