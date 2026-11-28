/**
 * Static JSON batches for a section's list of pages (`/section-batches/docs/1`, `/en/section-batches/docs/1`):
 * each batch holds the next four cards (`lib/section-batches.ts`), fetched on scroll by `components/section-list.tsx`.
 */
import type { NextRequest } from 'next/server';

import { locales, type Locale } from '#figatellultimate/locales';
import { urlOf } from '#figatellultimate/urls';

import {
  allSectionBatchParams,
  SECTION_BATCH_SIZE,
  sectionItemsOf,
  splitSectionBatches,
} from '../../../../lib/section-batches';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams(): { readonly locale: Locale; readonly slug: string[] }[] {
  return allSectionBatchParams();
}

export async function GET(
  _request: NextRequest,
  context: { readonly params: Promise<{ readonly locale: string; readonly slug: string[] }> },
): Promise<Response> {
  const { locale: rawLocale, slug } = await context.params;
  const locale = locales.find((candidate) => candidate === rawLocale);
  const batchIndex = Number(slug.at(-1));
  const sectionSegments = slug.slice(0, -1);

  if (locale === undefined || !Number.isInteger(batchIndex) || batchIndex < 1 || sectionSegments.length === 0)
    return new Response(null, { status: 404 });

  const url = urlOf(locale, sectionSegments);
  const items = await sectionItemsOf(locale, url);
  const batches = splitSectionBatches(
    items.map((item) => ({ item, card: item.kind === 'card' })),
    SECTION_BATCH_SIZE,
  );
  const batch = batches[batchIndex];

  if (batch === undefined) return new Response(null, { status: 404 });

  return Response.json(batch.map((entry) => entry.item));
}
