/** The root route: the pages (the home, the documentation and its `/page/N` slices), prerendered with their metadata. */
import { toNextMetadata } from '@figatellultimate/next16';
import { metadataOf, neighboursOf } from '@figatellultimate/site';
import { Pager } from '@figatellultimate/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { locales, type Locale } from '#figatellultimate/locales';
import { navigationOf } from '#figatellultimate/navigation';
import { metadataFields, pageSegment, routeParamsOf } from '#figatellultimate/urls';

import { EntryPage, entryMetadata, type FoundEntry } from '../../../components/entry-page';
import { SectionPages } from '../../../components/section-pages';
import { pageAt } from '../../../lib/route-page';
import {
  allSectionPageParams,
  sectionListingLocales,
  sectionPageCount,
  sectionPageUrl,
} from '../../../lib/section-batches';
import { site } from '../../../site';

// The app has a route per base (`splitRoutes: true`): this one serves the pages, the blog, the landing pages and the
// authors have their own (`blog/`, `lp/`, `authors/`), so that a page ships only its own kind's client code.

// Every page (and each section's `/page/2+` slice) is prerendered; an unknown URL is let through to `notFound()`,
// which renders the locale's 404 (`../not-found.tsx`) on demand, with a real 404 status.
export const dynamicParams = true;

export function generateStaticParams(): { locale: string; url: string[] }[] {
  return [...routeParamsOf(''), ...allSectionPageParams()];
}

async function pageOf(
  props: PageProps<'/[locale]/[[...url]]'>,
): Promise<{ readonly found: FoundEntry; readonly sectionPage: number } | undefined> {
  const direct = await pageAt(props.params, '');

  if (direct?.kind === 'entry') return { found: direct, sectionPage: 1 };

  const { locale, url = [] } = await props.params;
  const pageRaw = url.at(-1);

  if (url.length < 3 || url.at(-2) !== pageSegment || pageRaw === undefined || !/^[1-9]\d*$/.test(pageRaw))
    return undefined;

  const sectionPage = Number(pageRaw);

  if (sectionPage < 2) return undefined;

  const base = await pageAt(Promise.resolve({ locale, url: url.slice(0, -2) }), '');

  if (base?.kind !== 'entry' || sectionPage > sectionPageCount(base.entry.locale, base.entry.url)) return undefined;

  return { found: base, sectionPage };
}

export async function generateMetadata(props: PageProps<'/[locale]/[[...url]]'>): Promise<Metadata> {
  const resolved = await pageOf(props);

  if (resolved === undefined) return {};

  const { found, sectionPage } = resolved;

  if (sectionPage === 1) return entryMetadata(found);

  const { entry } = found;
  const alternates = Object.fromEntries(
    Object.entries(entry.alternates).flatMap(([code, target]) => {
      if (target === undefined) return [];

      const known = locales.find((candidate): candidate is Locale => candidate === code);

      return [
        [
          code,
          known !== undefined && sectionPageCount(known, target) >= sectionPage
            ? sectionPageUrl(target, sectionPage)
            : target,
        ] as const,
      ];
    }),
  );

  return toNextMetadata(
    metadataOf(
      { ...entry, url: sectionPageUrl(entry.url, sectionPage), alternates },
      metadataFields[found.collection],
      site,
    ),
  );
}

export default async function Page(props: PageProps<'/[locale]/[[...url]]'>): Promise<ReactNode> {
  const resolved = await pageOf(props);

  if (resolved === undefined) notFound();

  const { found, sectionPage } = resolved;
  const { entry } = found;
  const t = await getTranslations({ locale: entry.locale });
  // A page of a section (a documentation page): the previous and next ones, in the navigation's order.
  const { previous, next } = neighboursOf(navigationOf(entry.locale), entry.url);
  const listing = sectionListingLocales(entry.alternates);

  return (
    <EntryPage
      found={found}
      listing={listing}
      pageUrl={sectionPageUrl(entry.url, sectionPage)}
      indexed={sectionPage === 1}
      section={<SectionPages locale={entry.locale} url={entry.url} page={sectionPage} />}
      footer={
        <Pager
          previous={previous}
          next={next}
          labels={{ nav: t('ui.pager.nav'), previous: t('ui.pager.previous'), next: t('ui.pager.next') }}
        />
      }
    />
  );
}
