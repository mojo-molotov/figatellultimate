/** The landing pages' route: each landing page, prerendered with its metadata. */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { routeParamsOf } from '#figatellultimate/urls';

import { EntryPage, entryMetadata } from '../../../../components/entry-page';
import { pageAt } from '../../../../components/route-page';

// Every landing page is prerendered; an unknown one renders the locale's 404 on demand.
export const dynamicParams = true;

export function generateStaticParams(): { locale: string; url: string[] }[] {
  return routeParamsOf('lp');
}

async function pageOf(props: PageProps<'/[locale]/lp/[...url]'>) {
  const found = await pageAt(props.params, 'lp');

  return found?.kind === 'entry' ? found : undefined;
}

export async function generateMetadata(props: PageProps<'/[locale]/lp/[...url]'>): Promise<Metadata> {
  const found = await pageOf(props);

  return found === undefined ? {} : entryMetadata(found);
}

export default async function Page(props: PageProps<'/[locale]/lp/[...url]'>): Promise<ReactNode> {
  const found = await pageOf(props);

  if (found === undefined) notFound();

  return <EntryPage found={found} />;
}
