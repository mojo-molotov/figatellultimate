import { describe, expect, it, vi } from 'vitest';

import { listingIndexRoute } from '../listing-index.js';

interface Listing {
  readonly locale: string;
  readonly segments: readonly string[];
  readonly posts: readonly string[];
}

const LISTINGS: readonly Listing[] = [
  { locale: 'fr', segments: ['news', 'bot'], posts: ['a', 'b'] },
  { locale: 'en', segments: ['news', 'bot'], posts: ['c'] },
  { locale: 'fr', segments: ['guides'], posts: ['d'] },
];
const build = vi.fn((listing: Listing) => Promise.resolve({ items: listing.posts }));
const route = listingIndexRoute({
  listings: () => LISTINGS,
  params: (listing) => ({ locale: listing.locale, folder: listing.segments }),
  build,
});
const get = (params: { readonly locale: string; readonly folder: readonly string[] }) =>
  route.GET(new Request('https://example.org/'), { params: Promise.resolve(params) });

describe('listingIndexRoute', () => {
  it('prerenders one index per listing, at its own params', () => {
    expect(route.generateStaticParams()).toEqual([
      { locale: 'fr', folder: ['news', 'bot'] },
      { locale: 'en', folder: ['news', 'bot'] },
      { locale: 'fr', folder: ['guides'] },
    ]);
  });

  it("answers a listing's index as JSON, built from that listing alone", async () => {
    const response = await get({ locale: 'en', folder: ['news', 'bot'] });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^application\/json/);
    expect(await response.json()).toEqual({ items: ['c'] });
    expect(build).toHaveBeenLastCalledWith(LISTINGS[1]);
  });

  it.each([
    ['an unknown locale', { locale: 'de', folder: ['news', 'bot'] }],
    ['a folder no listing has', { locale: 'fr', folder: ['news'] }],
    ['a longer folder', { locale: 'fr', folder: ['news', 'bot', 'x'] }],
  ])('answers 404 for %s, building nothing', async (_, params) => {
    build.mockClear();
    const response = await get(params);

    expect(response.status).toBe(404);
    expect(build).not.toHaveBeenCalled();
  });
});

describe('listingIndexRoute: batches', () => {
  const batch = vi.fn((listing: Listing, range: { readonly from: number; readonly to: number }) =>
    Promise.resolve({ keys: listing.posts, from: range.from, to: range.to }),
  );
  const batched = listingIndexRoute({
    listings: () => LISTINGS.slice(0, 1),
    params: (listing) => ({ locale: listing.locale, folder: listing.segments }),
    build,
    pages: {
      // 23 pages: batches of 10, 10 and 3.
      count: () => 23,
      params: (listing, from) => ({ locale: listing.locale, folder: [...listing.segments, 'pages', String(from)] }),
      build: batch,
    },
  });

  it('prerenders each listing’s index, then a batch per run of ten pages', () => {
    expect(batched.generateStaticParams()).toEqual([
      { locale: 'fr', folder: ['news', 'bot'] },
      { locale: 'fr', folder: ['news', 'bot', 'pages', '1'] },
      { locale: 'fr', folder: ['news', 'bot', 'pages', '11'] },
      { locale: 'fr', folder: ['news', 'bot', 'pages', '21'] },
    ]);
  });

  it('answers a batch built from its own range, and 404 past the last one', async () => {
    const last = await batched.GET(new Request('https://example.org/'), {
      params: Promise.resolve({ locale: 'fr', folder: ['news', 'bot', 'pages', '21'] }),
    });

    expect(await last.json()).toEqual({ keys: ['a', 'b'], from: 21, to: 23 });
    expect(
      (
        await batched.GET(new Request('https://example.org/'), {
          params: Promise.resolve({ locale: 'fr', folder: ['news', 'bot', 'pages', '31'] }),
        })
      ).status,
    ).toBe(404);
  });
});

describe('listingIndexRoute: batches of listings without an index', () => {
  const batch = vi.fn((listing: Listing, range: { readonly from: number; readonly to: number }) =>
    Promise.resolve({ keys: listing.posts.slice(range.from - 1, range.to) }),
  );
  // A folder of folders, e.g. the blog's own page: batched, nothing to filter, so no index.
  const root: Listing = { locale: 'fr', segments: [], posts: ['news', 'guides'] };
  const mixed = listingIndexRoute({
    listings: () => LISTINGS.slice(2),
    params: (listing) => ({ locale: listing.locale, folder: listing.segments }),
    build,
    pages: {
      listings: () => [root, ...LISTINGS.slice(2)],
      count: (listing) => listing.posts.length,
      params: (listing, from) => ({ locale: listing.locale, folder: [...listing.segments, 'pages', String(from)] }),
      build: batch,
    },
  });

  it('prerenders the indexes of their listings, and the batches of its own', () => {
    expect(mixed.generateStaticParams()).toEqual([
      { locale: 'fr', folder: ['guides'] },
      { locale: 'fr', folder: ['pages', '1'] },
      { locale: 'fr', folder: ['guides', 'pages', '1'] },
    ]);
  });

  it('answers a batch of a listing without an index, and 404 for that index', async () => {
    build.mockClear();
    const answer = (folder: readonly string[]) =>
      mixed.GET(new Request('https://example.org/'), { params: Promise.resolve({ locale: 'fr', folder }) });

    expect(await (await answer(['pages', '1'])).json()).toEqual({ keys: ['news', 'guides'] });
    expect((await answer([])).status).toBe(404);
    expect(build).not.toHaveBeenCalled();
  });
});
