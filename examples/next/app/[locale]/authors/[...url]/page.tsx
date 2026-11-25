/** The authors' route: each author's page and its further pages, prerendered, the author described as a person. */
import { toNextMetadata } from '@figatellultimate/next16';
import { pageMetadataOf, personOf } from '@figatellultimate/site';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { taxonomies } from '#figatellultimate/taxonomies';
import { routeParamsOf } from '#figatellultimate/urls';

import { AuthorPage, authorName } from '../../../../blog/author-page';
import { PrintMargins } from '../../../../components/print-margins';
import { pageAt } from '../../../../components/route-page';
import { StructuredDataScript } from '../../../../components/structured-data';
import { site } from '../../../../site';

// Every author's page is prerendered; an unknown one renders the locale's 404 on demand.
export const dynamicParams = true;

export function generateStaticParams(): { locale: string; url: string[] }[] {
  return routeParamsOf('authors');
}

async function pageOf(props: PageProps<'/[locale]/authors/[...url]'>) {
  const found = await pageAt(props.params, 'authors');

  return found?.kind === 'term' ? found : undefined;
}

export async function generateMetadata(props: PageProps<'/[locale]/authors/[...url]'>): Promise<Metadata> {
  const found = await pageOf(props);

  if (found === undefined) return {};

  // The author's avatar as the page's image: previews of the link show who it is.
  const image = taxonomies.authors.data[found.term.term].avatar;
  // Its description: the message its taxonomy's SEO names (`pages.metadata`), the author's short bio.
  const described = found.term.metadata.description;
  const description =
    described === undefined ? undefined : (await getTranslations({ locale: found.term.locale }))(described);

  return toNextMetadata(
    pageMetadataOf({ ...found.term, title: await authorName(found.term), image, description }, site),
  );
}

export default async function Page(props: PageProps<'/[locale]/authors/[...url]'>): Promise<ReactNode> {
  const found = await pageOf(props);

  if (found === undefined) notFound();

  const { term } = found;
  const t = await getTranslations({ locale: term.locale });
  const person = personOf(
    {
      name: await authorName(term),
      url: term.url,
      image: taxonomies.authors.data[term.term].avatar,
      description: t(`taxonomies.authors.${term.term}.bio`),
    },
    site,
  );

  return (
    <>
      <PrintMargins title={await authorName(term)} url={term.url} />
      <StructuredDataScript data={[person]} />
      <AuthorPage page={term} />
    </>
  );
}
