'use client';

/**
 * A folder page's sections and its pagination: paginated on desktops (compact select on the heading's line, full
 * pagination below) and revealed in batches on scroll on phones (`<= 36rem`, page 1), sharing the same prerendered HTML
 * and static JSON batches (`<folder.batches>/pages/<n>`, `listing-index.ts`). A direct visit to `/page/2+` on a phone
 * keeps pagination so the reader can reach earlier pages.
 *
 * Key design decisions:
 *     - The sections are data rendered alike on both sides (`SectionData`), rather than rendered on the server only,
 *       so that a batch can show a page the server never sent (on desktop pagination or mobile scroll).
 *     - The pagination as a listing's on desktops: a select on the heading's line, and previous and next below (on the
 *       last section's "see more" line on a desktop, under it on a phone when landed on `/page/2+`, checked by
 *       `scripts/browse.ts`).
 */
import { batchPath, batchStart, defineFacetedCollection, type Engine, type UrlAdapter } from '@figatellultimate/facets';
import { PageSelect, Pagination, usePagedCollection, useResponsiveBatches } from '@figatellultimate/facets-react';
import { NextUrlBoundary } from '@figatellultimate/next16/facets';
import { Collector } from '@figatellultimate/effects';
import { EntryCard, type EntryCardLabels } from '@figatellultimate/ui';
import { formatPrecompiled } from '@figatellultimate/use-intl/format';
import NextLink from 'next/link';
import { useCallback, useMemo, type ReactNode } from 'react';

import { localeInfo, type Locale } from '#figatellultimate/locales';

import { cardPriority, CATEGORY_CARD_IMAGE_SIZES } from '../lib/priority';
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
  const scrollBatchUrls = useMemo(
    () =>
      paged.page === 1 && paged.pages > 1 && base !== undefined
        ? Array.from({ length: paged.pages - 1 }, (_, index) => {
            const page = index + 2;

            return `${base}/${batchPath(batchStart(page)).join('/')}#${String(page)}`;
          })
        : [],
    [base, paged.page, paged.pages],
  );
  const loadScrollPage = useCallback(
    async (entry: string): Promise<readonly { readonly key: string; readonly section: SectionData }[]> => {
      const hash = entry.lastIndexOf('#');
      const batchUrl = entry.slice(0, hash);
      const page = Number(entry.slice(hash + 1));
      const batch = await loadFolderBatch(batchUrl);
      const offset = (page - batchStart(page)) * paged.perPage;

      return batch.keys.slice(offset, offset + paged.perPage).flatMap((key) => {
        const section = batch.sections[key];

        return section === undefined ? [] : [{ key, section }];
      });
    },
    [paged.perPage],
  );
  const responsive = useResponsiveBatches({ batchUrls: scrollBatchUrls, load: loadScrollPage });
  const scrollMode = responsive.phone && scrollBatchUrls.length > 0;
  const pagedBatches = useMemo(
    () =>
      base === undefined
        ? undefined
        : { load: (from: number) => loadFolderBatch(`${base}/${batchPath(from).join('/')}`) },
    [base],
  );
  const { binding, batches } = usePagedCollection({
    engine,
    items: keys,
    paged,
    url,
    batches: scrollMode ? undefined : pagedBatches,
  });
  const scrollItems = useMemo(() => {
    if (!scrollMode) return undefined;

    const initial = keys.flatMap((key) => {
      const section = sections[key];

      return section === undefined ? [] : [{ key, section }];
    });

    return [...initial, ...responsive.loadedScrollBatches.flat()];
  }, [scrollMode, keys, sections, responsive.loadedScrollBatches]);
  const sectionOf = (key: string): SectionData | undefined =>
    sections[key] ?? batches.find((batch) => key in batch.sections)?.sections[key];
  const shown =
    scrollItems ??
    binding.view.keys.flatMap((key) => {
      const section = sectionOf(key);

      return section === undefined ? [] : [{ key, section }];
    });
  const pagination = scrollMode ? null : (
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
  const sentinel =
    scrollMode && (responsive.hasMoreScroll || responsive.status === 'loading') ? (
      <div ref={responsive.sentinelRef} data-slot="section-list-status" data-status={responsive.status} aria-hidden>
        <span data-slot="section-list-spinner" />
      </div>
    ) : null;
  // As a listing's: the compact pagination on the heading's line on desktops (and on phones landed on `/page/2+`),
  // omitted in phone scroll mode.
  const withPageSelect = (heading: ReactNode): ReactNode => (
    <div data-slot="folder-heading">
      {heading}
      {scrollMode ? null : (
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
      )}
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
        {sentinel}
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
                  <PostCard
                    card={card}
                    headingLevel={3}
                    priority={cardPriority('category', before + at, card.image)}
                    imageSizes={CATEGORY_CARD_IMAGE_SIZES}
                  />
                </li>
              ))}
            </ol>
            {/* The last section ends the page: its "see more" and the full pagination on one line, the pagination at
                its end (below it on a phone landed on `/page/2+`, the theme's; omitted in phone scroll mode). */}
            {index === shown.length - 1 && pagination !== null ? (
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
      {sentinel}
    </>
  );
}
