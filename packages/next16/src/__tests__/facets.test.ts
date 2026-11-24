// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const router = { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() };
// The page's location, as Next gives it: changed by a test to read another one.
const at = { pathname: '/blog/news', search: 'tags=bot' };

vi.mock('next/navigation.js', () => ({
  usePathname: () => at.pathname,
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(at.search),
}));

const { useNextUrl } = await import('../facets.js');

afterEach(() => {
  at.pathname = '/blog/news';
  at.search = 'tags=bot';
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
