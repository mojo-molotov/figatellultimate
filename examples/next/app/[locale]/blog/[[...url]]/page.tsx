/** The blog's route: its posts and its folder pages (the blog, a category, a subcategory), prerendered. */
import { toNextMetadata } from '@figatellultimate/next16';
import { pageMetadataOf } from '@figatellultimate/site';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { authorsTermUrl } from '#figatellultimate/terms';
import { routeParamsOf } from '#figatellultimate/urls';

import { BlogFolderPage, folderTitle } from '../../../../blog/folder-page';
import { PostFooter } from '../../../../blog/post-footer';
import { EntryPage, entryMetadata } from '../../../../components/entry-page';
import { PrintMargins } from '../../../../components/print-margins';
import { pageAt } from '../../../../lib/route-page';
import { breadcrumbDataOf, StructuredDataScript } from '../../../../components/structured-data';
import { site } from '../../../../site';

// Every post and folder page is prerendered; an unknown URL under `/blog` renders the locale's 404 on demand.
export const dynamicParams = true;

export function generateStaticParams(): { locale: string; url: string[] }[] {
  return routeParamsOf('blog');
}

async function pageOf(props: PageProps<'/[locale]/blog/[[...url]]'>) {
  const found = await pageAt(props.params, 'blog');

  return found !== undefined && found.kind !== 'term' && found.collection === 'blog' ? found : undefined;
}

export async function generateMetadata(props: PageProps<'/[locale]/blog/[[...url]]'>): Promise<Metadata> {
  const found = await pageOf(props);

  if (found === undefined) return {};

  if (found.kind === 'entry') return entryMetadata(found);

  const { image } = found.folder;
  // Every page of a folder under its folder's title, without a number: the page is the list, wherever one reads it.
  // Its description: the message its folder pages' SEO names (`folderPages.metadata`); none for the blog's own page.
  const described = found.folder.metadata.description;
  const description =
    described === undefined ? undefined : (await getTranslations({ locale: found.folder.locale }))(described);

  return toNextMetadata(
    pageMetadataOf({ ...found.folder, title: await folderTitle(found.folder), image, description }, site),
  );
}

export default async function Page(props: PageProps<'/[locale]/blog/[[...url]]'>): Promise<ReactNode> {
  const found = await pageOf(props);

  if (found === undefined) notFound();

  // The blog's folder pages: rendered from figatellultimate's neutral data.
  if (found.kind === 'folder') {
    const { folder } = found;

    return (
      <>
        <PrintMargins title={await folderTitle(folder)} url={folder.url} />
        <StructuredDataScript data={[await breadcrumbDataOf(folder.locale, folder.first)]} />
        <BlogFolderPage folder={folder} />
      </>
    );
  }

  const { entry } = found;
  const t = await getTranslations({ locale: entry.locale });
  // schema.org data: the post with its authors' names and pages.
  const authors = entry.terms.authors.map((key) => ({
    name: t(`taxonomies.authors.${key}.name`),
    url: authorsTermUrl(key, entry.locale),
  }));

  return <EntryPage found={found} article authors={authors} footer={<PostFooter post={entry} />} />;
}
