/** The root route: the pages (the home, the documentation), prerendered with their metadata. */
import { neighboursOf } from '@figatellultimate/site';
import { Pager } from '@figatellultimate/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { navigationOf } from '#figatellultimate/navigation';
import { routeParamsOf } from '#figatellultimate/urls';

import { EntryPage, entryMetadata } from '../../../components/entry-page';
import { pageAt } from '../../../lib/route-page';
import { SectionPages } from '../../../components/section-pages';

// The app has a route per base (`splitRoutes: true`): this one serves the pages, the blog, the landing pages and the
// authors have their own (`blog/`, `lp/`, `authors/`), so that a page ships only its own kind's client code.

// Every page is prerendered; an unknown URL is let through to `notFound()`, which renders the locale's 404
// (`../not-found.tsx`) on demand, with a real 404 status.
export const dynamicParams = true;

export function generateStaticParams(): { locale: string; url: string[] }[] {
  return routeParamsOf('');
}

async function pageOf(props: PageProps<'/[locale]/[[...url]]'>) {
  const found = await pageAt(props.params, '');

  return found?.kind === 'entry' ? found : undefined;
}

export async function generateMetadata(props: PageProps<'/[locale]/[[...url]]'>): Promise<Metadata> {
  const found = await pageOf(props);

  return found === undefined ? {} : entryMetadata(found);
}

export default async function Page(props: PageProps<'/[locale]/[[...url]]'>): Promise<ReactNode> {
  const found = await pageOf(props);

  if (found === undefined) notFound();

  const { entry } = found;
  const t = await getTranslations({ locale: entry.locale });
  // A page of a section (a documentation page): the previous and next ones, in the navigation's order.
  const { previous, next } = neighboursOf(navigationOf(entry.locale), entry.url);

  return (
    <EntryPage
      found={found}
      section={<SectionPages locale={entry.locale} url={entry.url} />}
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
