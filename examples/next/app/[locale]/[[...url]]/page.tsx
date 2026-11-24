/** The single catch-all route: every content URL, folder page and author page, prerendered with its metadata. */
import { toNextMetadata } from '@figatellultimate/next16';
import {
  markdownUrlOf,
  metadataOf,
  neighboursOf,
  pageMetadataOf,
  personOf,
  sectionOf,
  structuredDataOf,
} from '@figatellultimate/site';
import { keptHeadings } from '@figatellultimate/toc';
import { Pager } from '@figatellultimate/ui';
import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { navigationOf } from '#figatellultimate/navigation';
import { taxonomies } from '#figatellultimate/taxonomies';
import { authorsTermUrl } from '#figatellultimate/terms';
import { findByUrl, metadataFields, mountedUrls, segmentsOf, urlOf } from '#figatellultimate/urls';

import { AuthorPage, authorName } from '../../../blog/author-page';
import { BlogFolderPage, folderTitle } from '../../../blog/folder-page';
import { PostFooter } from '../../../blog/post-footer';
import { Body } from '../../../components/mdx';
import { SectionPages } from '../../../components/section-pages';
import { isExposed } from '../../../components/llms';
import { breadcrumbDataOf, StructuredDataScript } from '../../../components/structured-data';
import { trailOf } from '../../../components/trail';
import { PrintMargins } from '../../../components/print-margins';
import { Toc } from '../../../components/toc';
import { PageCrumbs, SiteHeader } from '../../../components/site-header';
import { routing } from '../../../i18n/routing';
import { site } from '../../../site';

// Every content route (pages, blog, landing pages), the blog's folder pages and the authors' pages, from configuration
// only: one optional catch-all per locale.

// Every mounted URL is prerendered; an unknown one is let through to `notFound()`, which renders the locale's 404
// (`../not-found.tsx`) on demand, with a real 404 status.
export const dynamicParams = true;

export function generateStaticParams(): { locale: string; url: string[] }[] {
  // Every mounted URL under its locale, entries and folder pages, each once; reserved entries are left to their
  // dedicated routes.
  return mountedUrls.map((item) => ({ locale: item.locale, url: segmentsOf(item.url, item.locale) }));
}

async function pageOf(props: PageProps<'/[locale]/[[...url]]'>) {
  const { locale, url } = await props.params;

  if (!hasLocale(routing.locales, locale)) return undefined;

  return findByUrl(urlOf(locale, url));
}

export async function generateMetadata(props: PageProps<'/[locale]/[[...url]]'>): Promise<Metadata> {
  const found = await pageOf(props);

  if (found === undefined) return {};

  if (found.kind === 'entry') return toNextMetadata(metadataOf(found.entry, metadataFields[found.collection], site));

  // An author's page and a folder page: no frontmatter, their title (and a folder's image) given.
  if (found.kind === 'term') {
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

export default async function Page(props: PageProps<'/[locale]/[[...url]]'>): Promise<ReactNode> {
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

  // An author's page: their posts, from figatellultimate's neutral data; described as a person.
  if (found.kind === 'term') {
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

  // The entry's body is what the search indexes; the header and the section's list stay out of it. Its
  // breadcrumb rides along as Pagefind metadata: the search shows where each result sits.
  const trail = await trailOf(found.entry.locale, found.entry.url);
  const body = (
    <>
      <div data-pagefind-body {...(trail === undefined ? {} : { 'data-pagefind-meta': `breadcrumb:${trail}` })}>
        <Body code={found.entry.data.mdx} />
      </div>
      {/* Out of the indexed body: a section's page lists its pages, which are indexed on their own. */}
      <SectionPages locale={found.entry.locale} url={found.entry.url} />
    </>
  );
  const { entry } = found;
  // schema.org data: the entry as its collection's type, with its authors' names and pages, and its breadcrumb.
  const authors =
    found.collection === 'blog'
      ? await Promise.all(
          found.entry.terms.authors.map(async (key) => {
            const t = await getTranslations({ locale: entry.locale });

            return { name: t(`taxonomies.authors.${key}.name`), url: authorsTermUrl(key, entry.locale) };
          }),
        )
      : [];
  const data = (
    <>
      {/* Exposed to LLMs: its Markdown version, and the llms.txt that lists it (llms.txt's discovery links). */}
      {isExposed(entry.url) ? (
        <>
          <link rel="alternate" type="text/markdown" href={markdownUrlOf(entry.url)} />
          <link rel="describedby" href={urlOf(entry.locale, ['llms.txt'])} />
        </>
      ) : null}
      <PrintMargins title={entry.data.title} url={entry.url} />
      <StructuredDataScript
        data={[
          structuredDataOf(entry, metadataFields[found.collection], site, { authors }),
          await breadcrumbDataOf(entry.locale, entry.url, entry.data.title),
        ]}
      />
    </>
  );

  // A post, or any page with sections (a documentation page): the article's layout, the navbar on
  // top; below it, the table of contents in the margin and the breadcrumb at the top of the text, so that the sidebar
  // starts right under the navbar. A page without sections keeps the plain layout, and so does a section's own page
  // (`/docs`), an index of its pages whatever headings its text has.
  const isSection = sectionOf(navigationOf(entry.locale), entry.url) !== undefined;

  if (found.collection !== 'blog' && (isSection || keptHeadings(entry.data.headings).length === 0))
    return (
      <>
        {data}
        <SiteHeader locale={entry.locale} url={entry.url} title={entry.data.title} />
        <main data-collection={found.collection}>{body}</main>
      </>
    );

  const t = await getTranslations({ locale: entry.locale });
  // A page of a section (a documentation page): the previous and next ones, in the navigation's order.
  const { previous, next } = neighboursOf(navigationOf(entry.locale), entry.url);
  const pager =
    found.collection === 'pages' ? (
      <Pager
        previous={previous}
        next={next}
        labels={{ nav: t('ui.pager.nav'), previous: t('ui.pager.previous'), next: t('ui.pager.next') }}
      />
    ) : null;

  return (
    <div data-layout="article">
      {data}
      <SiteHeader locale={entry.locale} url={entry.url} breadcrumb={false} />
      <Toc headings={entry.data.headings} labels={{ title: t('ui.toc.title'), toggle: t('ui.toc.toggle') }} />
      <main data-collection={found.collection}>
        <PageCrumbs locale={entry.locale} url={entry.url} title={entry.data.title} />
        {body}
        {found.collection === 'blog' ? <PostFooter post={found.entry} /> : pager}
      </main>
    </div>
  );
}
