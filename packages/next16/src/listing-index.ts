/**
 * `@figatellultimate/next16/listing-index`: the route of the listings' indexes, a server entry. A listing paginated in its
 * path holds its slice only; its index (every item, and whatever else its page needs, such as its cards) is one
 * static JSON, which the browser loads on the first selection or sort (`usePagedCollection` and `createIndexLoader`
 * of `@figatellultimate/facets-react`).
 *
 *     app/[locale]/listing/[...folder]/route.ts
 *       export const dynamic = 'force-static';           ← written in the route: Next reads them as literals
 *       export const dynamicParams = false;
 *       export const { GET, generateStaticParams } = listingIndexRoute({ listings, params, build });
 *
 * Key design decisions:
 *     - The app says what a listing is and what its index holds (`listings`, `build`); the route does the rest: one
 *       prerendered JSON per listing, a 404 for anything else, never rendered on demand.
 *     - The params are the app's own (its route's segments), matched exactly, arrays element by element.
 *     - The segment config (`dynamic`, `dynamicParams`) stays in the route file: Next only reads it there, as literals.
 *
 * Invariants (`listing-index.test.ts`): one index per listing, at its params, then its batches when `pages` is given,
 * each built from its own range; a listing's index built from it alone, as JSON; a 404 for unknown params, nothing
 * built.
 */
import { PAGES_PER_BATCH, batchesOf } from '@figatellultimate/facets';

/** A route's params: its dynamic segments, a catch-all as an array. */
type Params = Readonly<Record<string, string | readonly string[]>>;

/** What `listingIndexRoute` takes. */
export interface ListingIndexRouteOptions<L, P extends Params> {
  /** Every listing with an index (e.g. the first pages of the paginated folders). */
  readonly listings: () => readonly L[];
  /** A listing's params in the route, e.g. `{ locale, folder: [...segments] }`. */
  readonly params: (listing: L) => P;
  /** A listing's index: its items and anything else its page needs, serializable as JSON. */
  readonly build: (listing: L) => unknown;
  /**
   * The listing's batches (`batchesOf` of `@figatellultimate/facets`): its default view's pages in runs of `size`, each
   * a static JSON the browser loads to show those pages itself (`usePagedCollection`'s `batches`). None without it.
   */
  readonly pages?: ListingBatches<L, P> | undefined;
}

/** What a listing's batches are made of: its count of pages, each batch's params and content. */
export interface ListingBatches<L, P extends Params> {
  /** The listing's count of pages, its default view's. */
  readonly count: (listing: L) => number;
  /** Pages per batch; default `PAGES_PER_BATCH`. */
  readonly size?: number | undefined;
  /** A batch's params in the route, e.g. the listing's and `batchPath(from)`: `{ locale, folder: [...segments, 'pages', '11'] }`. */
  readonly params: (listing: L, from: number) => P;
  /** A batch's content: its pages' keys in the default order, and what the browser needs to show them. */
  readonly build: (listing: L, range: { readonly from: number; readonly to: number }) => unknown;
}

/** The route's handlers, to export from the route file. */
export interface ListingIndexRoute<P extends Params> {
  /** One set of params per listing: each index prerendered. */
  readonly generateStaticParams: () => P[];
  /** A listing's index as JSON; 404 for params no listing has. */
  readonly GET: (request: Request, context: { readonly params: Promise<Params> }) => Promise<Response>;
}

/** Whether two values of params are the same: strings equal, arrays element by element. */
const same = (a: string | readonly string[] | undefined, b: string | readonly string[] | undefined): boolean =>
  typeof a === 'string' || typeof b === 'string' || a === undefined || b === undefined
    ? a === b
    : a.length === b.length && a.every((value, index) => value === b[index]);

/**
 * The route of the listings' indexes: one static JSON per listing.
 *
 * @param options - The listings, each one's params in the route, and each one's index.
 * @returns `generateStaticParams` and `GET`, to export from the route file beside its literal segment config.
 *
 * @example
 * export const dynamic = 'force-static';
 * export const dynamicParams = false;
 * export const { GET, generateStaticParams } = listingIndexRoute({
 *   listings: () => pagedFolders,
 *   params: (folder) => ({ locale: folder.locale, folder: Object.values(folder.segments) }),
 *   build: async (folder) => ({ items: itemsOf(await postsOf(folder.entries)) }),
 * });
 */
export function listingIndexRoute<L, P extends Params>(options: ListingIndexRouteOptions<L, P>): ListingIndexRoute<P> {
  const { listings, params, build, pages } = options;
  // Every file the route serves: each listing's index, then its batches.
  const files = (): { readonly params: P; readonly content: () => unknown }[] =>
    listings().flatMap((listing) => [
      { params: params(listing), content: () => build(listing) },
      ...(pages === undefined
        ? []
        : batchesOf(pages.count(listing), pages.size ?? PAGES_PER_BATCH).map((range) => ({
            params: pages.params(listing, range.from),
            content: () => pages.build(listing, range),
          }))),
    ]);
  const matches = (own: P, asked: Params): boolean =>
    [...new Set([...Object.keys(own), ...Object.keys(asked)])].every((name) => same(own[name], asked[name]));

  return {
    generateStaticParams: () => files().map((file) => file.params),
    GET: async (_, context) => {
      const asked = await context.params;
      const file = files().find((candidate) => matches(candidate.params, asked));

      if (file === undefined) return new Response(null, { status: 404 });

      return Response.json(await file.content());
    },
  };
}
