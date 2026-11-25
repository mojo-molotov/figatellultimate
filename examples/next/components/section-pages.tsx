/** The list of a section's pages, below its own page. */
import { sectionOf } from '@figatellultimate/site';
import { EntryCard } from '@figatellultimate/ui';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { Collector } from '@figatellultimate/effects';

import type { Locale } from '#figatellultimate/locales';
import { navigationOf } from '#figatellultimate/navigation';
import { findPageByUrl } from '#figatellultimate/pages';

import { PRIORITY_CARDS } from './priority';

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
  const section = sectionOf(navigationOf(locale), url);

  if (section === undefined || section.children.length === 0) return null;

  const t = await getTranslations({ locale });
  // Each page's description and image, from its own frontmatter (loaded lazily).
  const pages = await Promise.all(
    section.children.map(async (node) => (node.kind === 'entry' ? findPageByUrl(node.url) : undefined)),
  );
  const labels = { tags: t('ui.card.tags'), authors: t('ui.card.authors'), more: t('ui.card.more') };

  return (
    <ul data-slot="folder-list">
      {section.children.map((node, index) => {
        // A subfolder is named by its content message: every locale translates it.
        const label = node.kind === 'entry' ? node.title : t(node.label);
        const page = pages[index];

        // A page as a post's preview: its image, its title, its description; a subfolder by its title.
        return (
          <li key={node.kind === 'entry' ? node.url : node.label}>
            {node.url === undefined ? (
              <h2>{label}</h2>
            ) : (
              <Collector>
                <EntryCard
                  // The page's first cards (subfolder headings aside): its largest paint, loaded at once.
                  priority={
                    section.children.slice(0, index).filter((above) => above.url !== undefined).length <
                    PRIORITY_CARDS.section
                  }
                  href={node.url}
                  title={label}
                  {...(page === undefined ? {} : { description: page.data.metadescription })}
                  {...(page?.data.featuredPictureUrl === undefined ? {} : { image: page.data.featuredPictureUrl })}
                  locale={locale}
                  labels={labels}
                />
              </Collector>
            )}
          </li>
        );
      })}
    </ul>
  );
}
