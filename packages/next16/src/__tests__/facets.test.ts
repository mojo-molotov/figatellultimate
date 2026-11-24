// @vitest-environment happy-dom
import { render, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const router = { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() };
// The page's location, as Next gives it: changed by a test to read another one. `prerendering`: the search unknown, as
// in a static prerender, where Next suspends the component reading it.
const at = { pathname: '/blog/news', search: 'tags=bot', prerendering: false };

vi.mock('next/navigation.js', () => ({
  usePathname: () => at.pathname,
  useRouter: () => router,
  useSearchParams: () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- how React suspends: a pending promise thrown.
    if (at.prerendering) throw new Promise(() => undefined);

    return new URLSearchParams(at.search);
  },
}));

const { NextUrlBoundary, useNextUrl, usePagedLocaleLinks } = await import('../facets.js');

afterEach(() => {
  at.pathname = '/blog/news';
  at.search = 'tags=bot';
  at.prerendering = false;
  vi.restoreAllMocks();
  router.push.mockClear();
  router.replace.mockClear();
  router.prefetch.mockClear();
});

describe('useNextUrl', () => {
  it("reads the page's search", () => {
    expect(renderHook(() => useNextUrl()).result.current.search).toBe('?tags=bot');
  });

  it("writes through the History API, which Next's router follows: no request to the server", () => {
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    const { result } = renderHook(() => useNextUrl());

    result.current.navigate('?page=2', { mode: 'push' });
    expect(push).toHaveBeenCalledWith(null, '', '/blog/news?page=2');
    result.current.navigate('?tags=bot&tags=release', { mode: 'replace' });
    expect(replace).toHaveBeenCalledWith(null, '', '/blog/news?tags=bot&tags=release');
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('an empty search leaves the path alone', () => {
    const replace = vi.spyOn(window.history, 'replaceState');

    renderHook(() => useNextUrl()).result.current.navigate('', { mode: 'replace' });
    expect(replace).toHaveBeenCalledWith(null, '', '/blog/news');
  });

  it('a listing paginated in its path: a default page read from the path, linked and reached there by the router', () => {
    at.pathname = '/blog/news/page/2';
    at.search = '';
    const push = vi.spyOn(window.history, 'pushState');
    const { result } = renderHook(() => useNextUrl({ first: '/blog/news' }));

    expect(result.current.search).toBe('?page=2');
    expect(result.current.href?.('?page=3')).toBe('/blog/news/page/3');
    // A default page: the prerendered page, through the router, without scrolling.
    result.current.navigate('?page=3', { mode: 'push' });
    expect(router.push).toHaveBeenCalledWith('/blog/news/page/3', { scroll: false });
    result.current.navigate('', { mode: 'replace' });
    expect(router.replace).toHaveBeenCalledWith('/blog/news', { scroll: false });
    // A selection: on the listing's URL, through the History API, never the router.
    result.current.navigate('?tags=bot&page=2', { mode: 'push' });
    expect(push).toHaveBeenCalledWith(null, '', '/blog/news?tags=bot&page=2');
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('moves only the address for a default page the app renders itself, never through the router', () => {
    at.pathname = '/blog/news/page/2';
    at.search = '';
    const push = vi.spyOn(window.history, 'pushState');
    const { result } = renderHook(() => useNextUrl({ first: '/blog/news' }));

    result.current.navigate('?page=3', { mode: 'push', local: true });
    expect(push).toHaveBeenCalledWith(null, '', '/blog/news/page/3');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('loads a default page ahead through the router, never a view in the query, which fetches nothing', () => {
    at.pathname = '/blog/news/page/2';
    at.search = '';
    const { result } = renderHook(() => useNextUrl({ first: '/blog/news' }));

    result.current.prefetch?.('?page=3');
    result.current.prefetch?.('');
    result.current.prefetch?.('?tags=bot');
    expect(router.prefetch.mock.calls).toEqual([['/blog/news/page/3'], ['/blog/news']]);
    // Without a listing paginated in its path, every view is in the query: nothing to load ahead.
    expect('prefetch' in renderHook(() => useNextUrl()).result.current).toBe(false);
  });

  it.each([
    // A page in the path mixed with a selection: that selection, on its first page, at the listing's URL.
    { pathname: '/blog/news/page/3', search: 'tags=bot', reads: '?tags=bot', history: '/blog/news?tags=bot' },
    // A default page in the query: its prerendered page, its slice from the server.
    { pathname: '/blog/news', search: 'page=2', reads: '?page=2', router: '/blog/news/page/2' },
  ])('corrects a location the listing does not write: $pathname?$search', ({ pathname, search, reads, ...to }) => {
    at.pathname = pathname;
    at.search = search;
    const replace = vi.spyOn(window.history, 'replaceState');
    const { result } = renderHook(() => useNextUrl({ first: '/blog/news' }));

    expect(result.current.search).toBe(reads);

    if ('history' in to) expect(replace).toHaveBeenCalledWith(null, '', to.history);
    else expect(router.replace).toHaveBeenCalledWith(to.router, { scroll: false });
  });

  it('leaves alone a location the listing writes', () => {
    const replace = vi.spyOn(window.history, 'replaceState');

    for (const [pathname, search] of [
      ['/blog/news/page/2', ''],
      ['/blog/news', 'tags=bot&page=2'],
    ] as const) {
      at.pathname = pathname;
      at.search = search;
      renderHook(() => useNextUrl({ first: '/blog/news' }));
    }

    expect(replace).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('usePagedLocaleLinks', () => {
  const links = [
    { locale: 'fr', url: '/blog/news/page/2', kind: 'entry', current: true },
    { locale: 'en', url: '/en/blog/news/page/2', kind: 'entry', current: false },
  ] as const;
  const listing = { fr: { first: '/blog/news', pages: 9 }, en: { first: '/en/blog/news', pages: 4 } };

  it.each([
    ['a page the browser moved to', '/blog/news/page/3', ['/blog/news/page/3', '/en/blog/news/page/3']],
    ['the first page', '/blog/news', ['/blog/news', '/en/blog/news']],
    ['a page past the other locale’s last', '/blog/news/page/6', ['/blog/news/page/6', '/en/blog/news']],
  ])('leads the switcher from %s to that page in each locale', (_, pathname, urls) => {
    at.pathname = pathname;
    at.search = '';

    expect(
      renderHook(() => usePagedLocaleLinks(links, { locale: 'fr', listing })).result.current.map((link) => link.url),
    ).toEqual(urls);
  });

  it.each([
    ['without a listing', '/blog/news/page/3', undefined],
    ['on a page outside the listing', '/blog/other', listing],
  ])('keeps the server’s links %s', (_, pathname, given) => {
    at.pathname = pathname;

    expect(renderHook(() => usePagedLocaleLinks(links, { locale: 'fr', listing: given })).result.current).toBe(links);
  });
});

describe('NextUrlBoundary', () => {
  /** What a listing renders from its adapter: the search it reads and the href of page 3. */
  const shown = (props: { readonly first?: string; readonly page?: number }): string | null => {
    const { container } = render(
      createElement(NextUrlBoundary, {
        ...props,
        children: (url) => createElement('p', null, `${url.search} ${url.href?.('?page=3') ?? '-'}`),
      }),
    );

    return container.textContent;
  };

  it('renders the landed page from its props while the search is unknown, its links real', () => {
    at.prerendering = true;

    expect(shown({ first: '/blog/news', page: 2 })).toBe('?page=2 /blog/news/page/3');
    expect(shown({})).toBe(' -');
  });

  it('renders from the address once it is known', () => {
    at.pathname = '/blog/news/page/4';
    at.search = '';

    expect(shown({ first: '/blog/news', page: 2 })).toBe('?page=4 /blog/news/page/3');
  });
});
