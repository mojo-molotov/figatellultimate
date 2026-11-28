'use client';

/**
 * A folder page's sections and its pagination, as a listing's: the compact one (a select) on the heading's line, the
 * full one (previous and next) below the sections. The blog's categories, or a category's subcategories with their
 * latest posts. Its landed page from the server (the HTML prerendered with them); the pages around it from its batches
 * (`<folder.batches>/pages/<n>`, `listing-index.ts`), loaded on idle, so that a page they hold is shown here at once,
 * only the address moving. `usePagedCollection` of `@figatellultimate/facets-react` does the orchestration, with no
 * index: a folder of folders has nothing to filter.
 *
 * Key design decisions:
 *     - The sections are data rendered alike on both sides (`SectionData`), rather than rendered on the server only,
 *       so that a batch can show a page the server never sent.
 *     - The pagination as a listing's: a select on the heading's line, at its end on a phone too, and previous and next
 *       below: on the last section's "see more" line on a desktop, under it on a phone (checked by
 *       `scripts/browse.ts`).
 */
import { batchPath, defineFacetedCollection, type Engine, type UrlAdapter } from '@figatellultimate/facets';
import { PageSelect, Pagination, usePagedCollection } from '@figatellultimate/facets-react';
import { NextUrlBoundary } from '@figatellultimate/next16/facets';
import { Collector } from '@figatellultimate/effects';
import { EntryCard, type EntryCardLabels } from '@figatellultimate/ui';
import { formatPrecompiled } from '@figatellultimate/use-intl/format';
import NextLink from 'next/link';
import { useMemo, type ReactNode } from 'react';

import { localeInfo, type Locale } from '#figatellultimate/locales';

import { cardPriority } from '../components/priority';
import { PostCard, type SectionData } from './cards';
import { loadFolderBatch } from './listing-index';
import type { ListingLabels } from './listing-labels';
import { PAGINATION_ICONS } from './pagination-icons';

/**
 * A folder page: its page, its pages, its subfolders' count and page size, its first page, the segment its pages'
 * URLs carry (`pageSegment` of `#figatellultimate/urls`, read on the server), its batches if any.
 */
export interface FolderPaged {
  readonly page: number;
  readonly pages: number;
  readonly total: number;
  readonly perPage: number;
  readonly first: string;
  readonly segment: string;
  /** The URL its batches live under (`folder.batches`); none for a level without a page size. */
  readonly batches?: string | undefined;
}

interface FolderSectionsProps {
  /** `null` for the blog's own page (its categories as cards), else the level whose subfolders are shown. */
  readonly level: string | null;
  /** The page's title, its `<h1>`. */
  readonly title: string;
  /** The landed page's subfolders' keys, in the folders' order. */
  readonly keys: readonly string[];
  /** The landed page's sections, by key. */
  readonly sections: Readonly<Record<string, SectionData>>;
  readonly paged: FolderPaged;
  readonly locale: Locale;
  readonly labels: ListingLabels['pagination'];
  /** The cards' texts. */
  readonly cardLabels: EntryCardLabels;
}

/** One subfolder a key, no facet: the engine over a page's keys. */
const enginesOf =
  (perPage: number) =>
  (keys: readonly string[]): Engine<string> =>
    defineFacetedCollection<string>({ items: keys, key: String, facets: {}, sorts: { given: () => 0 }, perPage });

/**
 * A folder page's sections and pagination.
 *
 * @param props - The level, the title, the landed page's sections, the page, the locale and the texts.
 * @returns The sections: the landed page prerendered, the others shown here from their batches once read.
 */
export function FolderSections(props: FolderSectionsProps): ReactNode {
  return (
    <NextUrlBoundary first={props.paged.first} page={props.paged.page} segment={props.paged.segment}>
      {(url) => <SectionsView {...props} url={url} />}
    </NextUrlBoundary>
  );
}

function SectionsView({
  level,
  title,
  keys,
  sections,
  paged,
  locale,
  labels,
  cardLabels,
  url,
}: FolderSectionsProps & { readonly url: UrlAdapter }): ReactNode {
  const engine = useMemo(() => enginesOf(paged.perPage), [paged.perPage]);
  const base = paged.batches;
  const batchesOf = useMemo(
    () =>
      base === undefined
        ? undefined
        : { load: (from: number) => loadFolderBatch(`${base}/${batchPath(from).join('/')}`) },
    [base],
  );
  const { binding, batches } = usePagedCollection({ engine, items: keys, paged, url, batches: batchesOf });
  const sectionOf = (key: string): SectionData | undefined =>
    sections[key] ?? batches.find((batch) => key in batch.sections)?.sections[key];
  const shown = binding.view.keys.flatMap((key) => {
    const section = sectionOf(key);

    return section === undefined ? [] : [{ key, section }];
  });
  const pagination = (
    <Pagination
      binding={binding}
      labels={{
        nav: labels.nav,
        previous: labels.previous,
        next: labels.next,
        page: (number) => formatPrecompiled(labels.page, locale, { page: number }),
        current: (number, total) => formatPrecompiled(labels.current, locale, { page: number, pages: total }),
        more: (hidden) => formatPrecompiled(labels.more, locale, { from: hidden[0] ?? 0, to: hidden.at(-1) ?? 0 }),
      }}
      locale={locale}
      dir={localeInfo[locale].dir}
      icons={PAGINATION_ICONS}
    />
  );
  // As a listing's: the compact pagination on the heading's line, at its end (a phone's included), the full one below
  // the sections.
  const withPageSelect = (heading: ReactNode): ReactNode => (
    <div data-slot="folder-heading">
      {heading}
      <PageSelect
        binding={binding}
        labels={{
          trigger: labels.jump,
          current: (page, pages) => formatPrecompiled(labels.short, locale, { page, pages }),
          spoken: (page, pages) => formatPrecompiled(labels.spoken, locale, { page, pages }),
          page: (page) => formatPrecompiled(labels.page, locale, { page }),
        }}
        locale={locale}
        dir={localeInfo[locale].dir}
      />
    </div>
  );

  // A section's link towards its every post, when its preview holds fewer.
  const more = (section: SectionData): ReactNode =>
    section.more === undefined ? null : (
      <NextLink href={section.more.href} data-slot="folder-more">
        {section.more.text}
      </NextLink>
    );

  if (level === null)
    return (
      <>
        {withPageSelect(<h1>{title}</h1>)}
        {/* Each category as a post's preview: its image, its title, its description. */}
        <ul data-slot="folder-list">
          {shown.map(({ key, section }, index) => (
            <li key={key}>
              <Collector>
                <EntryCard
                  // The first categories' images: the page's largest paint, loaded at once.
                  priority={cardPriority('blog', index, section.image)}
                  href={section.href ?? paged.first}
                  title={section.title}
                  {...(section.description === undefined ? {} : { description: section.description })}
                  {...(section.image === undefined ? {} : { image: section.image })}
                  locale={locale}
                  labels={cardLabels}
                />
              </Collector>
            </li>
          ))}
        </ul>
        {pagination}
      </>
    );

  return (
    <>
      <h1>{title}</h1>
      {shown.map(({ key, section }, index) => {
        // The cards of the sections above: this section's first card's rank on the page.
        const before = shown.slice(0, index).reduce((sum, above) => sum + above.section.posts.length, 0);
        const heading = (
          <h2>
            {section.href === undefined ? section.title : <NextLink href={section.href}>{section.title}</NextLink>}
          </h2>
        );

        return (
          <section key={key} data-slot="folder-section">
            {/* The compact pagination on the first section's heading: the page's own title stands alone above them. */}
            {index === 0 ? withPageSelect(heading) : heading}
            <ol data-slot="listing-cards">
              {section.posts.map((card, at) => (
                <li key={card.href}>
                  {/* Under the section's own heading; the page's first cards, its largest paint, loaded at once. */}
                  <PostCard card={card} headingLevel={3} priority={cardPriority('category', before + at, card.image)} />
                </li>
              ))}
            </ol>
            {/* The last section ends the page: its "see more" and the full pagination on one line, the pagination at
                its end (below it on a phone, the theme's). */}
            {index === shown.length - 1 ? (
              <div data-slot="folder-end">
                {/* The link on a line of its own, as in every section: the pagination beside it moves it not. */}
                <div data-slot="folder-end-more">{more(section)}</div>
                {pagination}
              </div>
            ) : (
              more(section)
            )}
          </section>
        );
      })}
    </>
  );
}
