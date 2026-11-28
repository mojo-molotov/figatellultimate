/** The list of a section's pages, below its own page; loads further batches from static JSON on scroll (`section-list.tsx`). */
import { Collector } from '@figatellultimate/effects';
import { EntryCard } from '@figatellultimate/ui';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import type { Locale } from '#figatellultimate/locales';

import { paginationLabels } from '../blog/listing-labels';
import { cardPriority } from '../lib/priority';
import { SECTION_BATCH_SIZE, sectionBatchUrl, sectionItemsOf, splitSectionBatches } from '../lib/section-batches';
import { SectionList, type SectionInitialItem } from './section-list';

/**
 * The pages of the section a page opens, e.g. `/docs` lists its pages and subfolders: the same navigation as
 * the navbar and the breadcrumb, each page as a post's preview (its image, its description), as the blog
 * lists its categories. Nothing
 * for a page that opens no section.
 */
export async function SectionPages({
  locale,
  url,
}: {
  readonly locale: Locale;
  readonly url: string;
}): Promise<ReactNode> {
  const items = await sectionItemsOf(locale, url);

  if (items.length === 0) return null;

  const t = await getTranslations({ locale });
  const labels = { tags: t('ui.card.tags'), authors: t('ui.card.authors'), more: t('ui.card.more') };
  const batches = splitSectionBatches(
    items.map((item) => ({ item, card: item.kind === 'card' })),
    SECTION_BATCH_SIZE,
  );
  const first = batches[0] ?? [];
  let cardRank = 0;
  const initial: SectionInitialItem[] = first.map(({ item }) => {
    if (item.kind === 'heading') return { key: item.key, node: <h2>{item.title}</h2> };

    const rank = cardRank;

    cardRank += 1;

    return {
      key: item.key,
      node: (
        <Collector>
          <EntryCard
            // The page's first cards (subfolder headings aside): its largest paint, loaded at once.
            priority={cardPriority('section', rank, item.image)}
            href={item.href}
            title={item.title}
            {...(item.description === undefined ? {} : { description: item.description })}
            {...(item.image === undefined ? {} : { image: item.image })}
            locale={locale}
            labels={labels}
          />
        </Collector>
      ),
    };
  });

  if (batches.length <= 1)
    return (
      <ul data-slot="folder-list">
        {initial.map((item) => (
          <li key={item.key}>{item.node}</li>
        ))}
      </ul>
    );

  const batchUrls = batches.slice(1).map((_, index) => sectionBatchUrl(locale, url, index + 1));
  const totalCards = items.filter((item) => item.kind === 'card').length;

  return (
    <SectionList
      initial={initial}
      batchUrls={batchUrls}
      totalCards={totalCards}
      batchSize={SECTION_BATCH_SIZE}
      locale={locale}
      labels={labels}
      paginationLabels={await paginationLabels(locale)}
    />
  );
}
