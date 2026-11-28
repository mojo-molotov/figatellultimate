/**
 * An entry's page, whatever route serves it (the pages, the blog, the landing pages): its metadata, its structured
 * data, its body and its layout. Each route adds what is its own (the documentation's previous and next links, a
 * post's footer), so that a route imports only the client code of its own kind of page.
 */
import { toNextMetadata } from '@figatellultimate/next16';
import { markdownUrlOf, metadataOf, sectionOf, structuredDataOf, type ListingLocales } from '@figatellultimate/site';
import { keptHeadings } from '@figatellultimate/toc';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { navigationOf } from '#figatellultimate/navigation';
import { metadataFields, urlOf, type UrlEntry } from '#figatellultimate/urls';

import { site } from '../site';
import { isExposed } from '../lib/llms';
import { Body } from './mdx';
import { PrintMargins } from './print-margins';
import { PageCrumbs, SiteHeader } from './site-header';
import { breadcrumbDataOf, StructuredDataScript } from './structured-data';
import { Toc } from './toc';
import { trailOf } from '../lib/trail';

/** A mounted entry, as `findByUrl` finds it. */
export type FoundEntry = Extract<UrlEntry, { kind: 'entry' }>;

/**
 * An entry's metadata, from its frontmatter.
 *
 * @param found - The entry.
 * @returns Next's metadata: title, description, alternates, Open Graph.
 */
export function entryMetadata(found: FoundEntry): Metadata {
  return toNextMetadata(metadataOf(found.entry, metadataFields[found.collection], site));
}

/**
 * An entry's page: its body, indexed by the search, in the article's layout (the table of contents in the margin)
 * when it has sections, or the plain one.
 *
 * @param props - The entry; whether it always takes the article's layout (a post); its authors, for its structured
 *   data; its section's list of pages (`SectionPages`, out of the indexed body); and what follows its body in the
 *   article's layout (a pager, a post's footer).
 * @returns The page.
 */
export async function EntryPage(props: {
  readonly found: FoundEntry;
  readonly article?: boolean;
  readonly authors?: readonly { readonly name: string; readonly url: string | undefined }[];
  readonly section?: ReactNode;
  readonly footer?: ReactNode;
  /** Paged section descriptors per locale, so the locale switcher follows `/docs/page/N` ↔ `/en/docs/page/N`. */
  readonly listing?: ListingLocales | undefined;
  /** The rendered page's URL when it differs from the entry's first page (e.g. `/docs/page/2`). */
  readonly pageUrl?: string | undefined;
  /** Whether Pagefind indexes this page's body; `false` on `/page/2+` slices so the search never duplicates `/docs`. */
  readonly indexed?: boolean | undefined;
}): Promise<ReactNode> {
  const { found, indexed = true } = props;
  const { entry } = found;
  const currentUrl = props.pageUrl ?? entry.url;
  // The entry's body is what the search indexes; the header and the section's list stay out of it. Its
  // breadcrumb rides along as Pagefind metadata: the search shows where each result sits.
  const trail = await trailOf(entry.locale, entry.url);
  const body = (
    <>
      <div
        {...(indexed
          ? {
              'data-pagefind-body': '',
              ...(trail === undefined ? {} : { 'data-pagefind-meta': `breadcrumb:${trail}` }),
            }
          : { 'data-pagefind-ignore': 'all' })}
      >
        <Body code={entry.data.mdx} />
      </div>
      {/* Out of the indexed body: a section's page lists its pages, which are indexed on their own. */}
      {props.section}
    </>
  );
  const data = (
    <>
      {/* Exposed to LLMs: its Markdown version, and the llms.txt that lists it (llms.txt's discovery links). */}
      {isExposed(entry.url) ? (
        <>
          <link rel="alternate" type="text/markdown" href={markdownUrlOf(entry.url)} />
          <link rel="describedby" href={urlOf(entry.locale, ['llms.txt'])} />
        </>
      ) : null}
      <PrintMargins title={entry.data.title} url={currentUrl} />
      <StructuredDataScript
        data={[
          structuredDataOf(entry, metadataFields[found.collection], site, { authors: props.authors ?? [] }),
          await breadcrumbDataOf(entry.locale, entry.url, entry.data.title),
        ]}
      />
    </>
  );
  // A post, or any page with sections (a documentation page): the article's layout, the navbar on top; below it, the
  // table of contents in the margin and the breadcrumb at the top of the text, so that the sidebar starts right under
  // the navbar. A page without sections keeps the plain layout, and so does a section's own page (`/docs`), an index
  // of its pages whatever headings its text has.
  const isSection = sectionOf(navigationOf(entry.locale), entry.url) !== undefined;

  if (props.article !== true && (isSection || keptHeadings(entry.data.headings).length === 0))
    return (
      <>
        {data}
        <SiteHeader
          locale={entry.locale}
          url={currentUrl}
          crumbs={entry.url}
          translates={entry.url}
          title={entry.data.title}
          listing={props.listing}
        />
        <main data-collection={found.collection}>{body}</main>
      </>
    );

  const t = await getTranslations({ locale: entry.locale });

  return (
    <div data-layout="article">
      {data}
      <SiteHeader locale={entry.locale} url={entry.url} breadcrumb={false} />
      <Toc headings={entry.data.headings} labels={{ title: t('ui.toc.title'), toggle: t('ui.toc.toggle') }} />
      <main data-collection={found.collection}>
        <PageCrumbs locale={entry.locale} url={entry.url} title={entry.data.title} />
        {body}
        {props.footer}
      </main>
    </div>
  );
}
