/**
 * A page's search markers, out of its indexed text: its collection as a Pagefind filter, its date as a meta, its sort
 * keys (its title without case or accents, its date), inserted before `</body>`. Internal to the package.
 *
 * Invariant (`markers.test.ts`): every value as written, escaped, whatever it holds (`$&`, `$$`: a replacement
 * string would read them as patterns).
 */
/** A built page to index: its URL, locale and collection come from figatellultimate (one rule). */
export interface SearchPage {
  readonly url: string;
  readonly locale: string;
  readonly collection: string;
  /** The full built HTML, `<html>` included. */
  readonly html: string;
  /** What the search sorts it by: its title and publication date, from its collection's metadata fields. */
  readonly sort?: { readonly title?: string | undefined; readonly date?: string | undefined } | undefined;
}

/**
 * The sort keys every page gets, read by `@figatellultimate/search`: `title` lowercased without accents (Pagefind
 * compares raw strings), and the date twice, so that undated pages come last both newest and oldest first.
 */
export const SORT_KEYS = { title: 'title', newest: 'newest', oldest: 'oldest' } as const;
const UNDATED = { newest: '0000-00-00', oldest: '9999-12-31' } as const;

const titleKey = (title: string): string =>
  title
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en')
    .trim();

const attribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The page with its collection as a Pagefind filter, its sort keys and its date, out of the indexed text.
 *
 * @param page - The page: its HTML, its collection, its title and date to sort by.
 * @returns Its HTML, the hidden markers before `</body>` (at the end without one).
 *
 * @example
 * withMarkers({ url: '/a', locale: 'fr', collection: 'blog', html, sort: { title: 'Écrire', date: '2026-01-01' } });
 */
export function withMarkers(page: SearchPage): string {
  const keys: [string, string][] = [
    [SORT_KEYS.title, titleKey(page.sort?.title ?? page.url)],
    [SORT_KEYS.newest, page.sort?.date ?? UNDATED.newest],
    [SORT_KEYS.oldest, page.sort?.date ?? UNDATED.oldest],
  ];
  const date = page.sort?.date;
  const marker = [
    `<span hidden data-pagefind-ignore data-pagefind-filter="collection:${attribute(page.collection)}"></span>`,
    // Its date, shown by the search's results.
    ...(date === undefined
      ? []
      : [`<span hidden data-pagefind-ignore data-pagefind-meta="date:${attribute(date)}"></span>`]),
    ...keys.map(
      ([key, value]) => `<span hidden data-pagefind-ignore data-pagefind-sort="${key}:${attribute(value)}"></span>`,
    ),
  ].join('');

  return page.html.includes('</body>')
    ? page.html.replace('</body>', () => `${marker}</body>`)
    : `${page.html}${marker}`;
}
