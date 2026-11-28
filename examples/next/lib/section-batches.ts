/**
 * Static JSON batches and prerendered `/page/N` routes for a section's list of pages (`/docs`, `/docs/page/2`, …):
 * each page prerenders its slice of four cards, and every batch (0..N-1) is also served as static JSON
 * (`app/[locale]/section-batches/[...slug]/route.ts`) for instant desktop page switches and phone scroll-loading.
 * Pure batching helpers live in `@figatellultimate/site`.
 */
import { pagedHref } from '@figatellultimate/facets';
import { pagedSectionsOf, sectionOf, splitSectionBatches, type ListingLocales } from '@figatellultimate/site';
import { getTranslations } from 'next-intl/server';

import { locales, type Locale } from '#figatellultimate/locales';
import { navigationOf } from '#figatellultimate/navigation';
import { findPageByUrl } from '#figatellultimate/pages';
import { pageSegment, urlOf } from '#figatellultimate/urls';

export { splitSectionBatches };

/** How many cards each section page prerenders and how many each JSON batch holds. */
export const SECTION_BATCH_SIZE = 4;

/** One item of a section's JSON batch: a card's data, or a subfolder's heading. */
export type SectionBatchItem =
  | { readonly kind: 'heading'; readonly key: string; readonly title: string }
  | {
      readonly kind: 'card';
      readonly key: string;
      readonly href: string;
      readonly title: string;
      readonly description?: string | undefined;
      readonly image?: string | undefined;
    };

/** The path segments of a section's URL, without any leading locale prefix. */
function sectionSegmentsOf(locale: Locale, url: string): string[] {
  const segments = url.split('/').filter(Boolean);

  return segments[0] === locale ? segments.slice(1) : segments;
}

/** The public URL of a section's JSON batch (`batchIndex` from 0). */
export function sectionBatchUrl(locale: Locale, url: string, batchIndex: number): string {
  return urlOf(locale, ['section-batches', ...sectionSegmentsOf(locale, url), String(batchIndex)]);
}

/** The public URL of a section's 1-based page (`/docs` for page 1, `/docs/page/2` for page 2). */
export function sectionPageUrl(first: string, page: number): string {
  return pagedHref(first, page > 1 ? `?page=${String(page)}` : '', { segment: pageSegment });
}

/** Number of prerendered pages for a section URL (`0` when the URL is not a multi-page section). */
export function sectionPageCount(locale: Locale, url: string): number {
  return pagedSectionsOf(navigationOf(locale), SECTION_BATCH_SIZE).find((entry) => entry.url === url)?.batches ?? 0;
}

/**
 * Listing descriptors per locale for a multi-page section (e.g. `/docs` and `/en/docs`), so `usePagedLocaleLinks`
 * keeps the locale switcher aligned with `/docs/page/N` ↔ `/en/docs/page/N`.
 */
export function sectionListingLocales(
  alternates: Readonly<Partial<Record<string, string>>>,
): ListingLocales | undefined {
  const entries = locales.flatMap((locale) => {
    const first = alternates[locale];

    if (first === undefined) return [];

    const pages = sectionPageCount(locale, first);

    return pages > 1 ? ([[locale, { first, pages }]] as const) : [];
  });

  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

/** Every item of a section in its reading order, with each page's frontmatter description and image. */
export async function sectionItemsOf(locale: Locale, url: string): Promise<SectionBatchItem[]> {
  const section = sectionOf(navigationOf(locale), url);

  if (section === undefined || section.children.length === 0) return [];

  const t = await getTranslations({ locale });
  const pages = await Promise.all(
    section.children.map(async (node) => (node.kind === 'entry' ? findPageByUrl(node.url) : undefined)),
  );

  return section.children.map((node, index): SectionBatchItem => {
    const label = node.kind === 'entry' ? node.title : t(node.label);
    const page = pages[index];

    if (node.url === undefined) return { kind: 'heading', key: node.kind === 'entry' ? '' : node.label, title: label };

    return {
      kind: 'card',
      key: node.url,
      href: node.url,
      title: label,
      ...(page === undefined ? {} : { description: page.data.metadescription }),
      ...(page?.data.featuredPictureUrl === undefined ? {} : { image: page.data.featuredPictureUrl }),
    };
  });
}

/** Every `{ locale, slug }` parameter for `app/[locale]/section-batches/[...slug]/route.ts` (batches `0..N-1`). */
export function allSectionBatchParams(): { readonly locale: Locale; readonly slug: string[] }[] {
  return locales.flatMap((locale) =>
    pagedSectionsOf(navigationOf(locale), SECTION_BATCH_SIZE).flatMap(({ url, batches }) => {
      const segments = sectionSegmentsOf(locale, url);

      return Array.from({ length: batches }, (_, index) => ({
        locale,
        slug: [...segments, String(index)],
      }));
    }),
  );
}

/** Every `{ locale, url }` parameter for prerendered section pages `2..N` (`/docs/page/2`, `/en/docs/page/2`, …). */
export function allSectionPageParams(): { locale: Locale; url: string[] }[] {
  return locales.flatMap((locale) =>
    pagedSectionsOf(navigationOf(locale), SECTION_BATCH_SIZE).flatMap(({ url, batches }) => {
      const segments = sectionSegmentsOf(locale, url);

      return Array.from({ length: batches - 1 }, (_, index) => ({
        locale,
        url: [...segments, pageSegment, String(index + 2)],
      }));
    }),
  );
}
