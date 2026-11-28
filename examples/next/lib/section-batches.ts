/**
 * Static JSON batches for a section's list of pages (`/docs`): the page prerenders its first four cards, and every
 * subsequent batch is a static JSON file (`app/[locale]/section-batches/[...slug]/route.ts`) fetched by
 * `components/section-list.tsx`. Pure batching helpers live in `@figatellultimate/site`.
 */
import { pagedSectionsOf, sectionOf, splitSectionBatches } from '@figatellultimate/site';
import { getTranslations } from 'next-intl/server';

import { locales, type Locale } from '#figatellultimate/locales';
import { navigationOf } from '#figatellultimate/navigation';
import { findPageByUrl } from '#figatellultimate/pages';
import { urlOf } from '#figatellultimate/urls';

export { splitSectionBatches };

/** How many cards a section's page prerenders and how many each JSON batch appends. */
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

/** The public URL of a section's JSON batch (`batchIndex` from 1). */
export function sectionBatchUrl(locale: Locale, url: string, batchIndex: number): string {
  return urlOf(locale, ['section-batches', ...sectionSegmentsOf(locale, url), String(batchIndex)]);
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

/** Every `{ locale, slug }` parameter for `app/[locale]/section-batches/[...slug]/route.ts`. */
export function allSectionBatchParams(): { readonly locale: Locale; readonly slug: string[] }[] {
  return locales.flatMap((locale) =>
    pagedSectionsOf(navigationOf(locale), SECTION_BATCH_SIZE).flatMap(({ url, batches }) => {
      const segments = sectionSegmentsOf(locale, url);

      return Array.from({ length: batches - 1 }, (_, index) => ({
        locale,
        slug: [...segments, String(index + 1)],
      }));
    }),
  );
}
