/**
 * Static JSON batches for a section's list of pages (`/section-batches/docs/1`, `/en/section-batches/docs/1`):
 * each batch holds the next four cards (`lib/section-batches.ts`), served via `listingIndexRoute` of
 * `@figatellultimate/next16/listing-index`.
 */
import { listingIndexRoute } from '@figatellultimate/next16/listing-index';

import { urlOf } from '#figatellultimate/urls';

import {
  allSectionBatchParams,
  SECTION_BATCH_SIZE,
  sectionItemsOf,
  splitSectionBatches,
} from '../../../../lib/section-batches';

export const dynamic = 'force-static';
export const dynamicParams = false;

export const { GET, generateStaticParams } = listingIndexRoute({
  listings: allSectionBatchParams,
  params: ({ locale, slug }) => ({ locale, slug }),
  build: async ({ locale, slug }) => {
    const batchIndex = Number(slug.at(-1));
    const url = urlOf(locale, slug.slice(0, -1));
    const items = await sectionItemsOf(locale, url);
    const batches = splitSectionBatches(
      items.map((item) => ({ item, card: item.kind === 'card' })),
      SECTION_BATCH_SIZE,
    );

    return (batches[batchIndex] ?? []).map((entry) => entry.item);
  },
});
