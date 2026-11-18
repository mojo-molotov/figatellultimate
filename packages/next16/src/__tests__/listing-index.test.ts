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
