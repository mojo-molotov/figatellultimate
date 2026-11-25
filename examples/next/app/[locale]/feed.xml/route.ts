/** The blog's RSS feed, one per locale, prerendered. */
import { rssOf } from '@figatellultimate/site';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';

import { blogIndex } from '#figatellultimate/blog';
import { locales } from '#figatellultimate/locales';
import { metadataFields, mountedUrls, urlOf } from '#figatellultimate/urls';

import { routing } from '../../../i18n/routing';
import { site } from '../../../site';

// The blog's RSS feed per locale, prerendered: `/feed.xml` and `/en/feed.xml` (the proxy serves the former).
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams(): { locale: string }[] {
  return locales.map((locale) => ({ locale }));
}

export async function GET(
  _: Request,
  context: { readonly params: Promise<{ readonly locale: string }> },
): Promise<Response> {
  const { locale } = await context.params;

  if (!hasLocale(routing.locales, locale)) return new Response(null, { status: 404 });

  const t = await getTranslations({ locale });
  const items = blogIndex.filter((item) => item.locale === locale && !item.reserved);
  const posts = await Promise.all(items.map(async (item) => ({ item, data: (await item.load()).data })));
  const tags = new Map(
    posts.map(({ item }) => [item.url, item.terms.tags.map((key) => t(`taxonomies.tags.${key}.label`))]),
  );
  const names = new Map(
    posts.map(({ item }) => [item.url, item.terms.authors.map((key) => t(`taxonomies.authors.${key}.name`))]),
  );
  const xml = rssOf({
    channel: {
      title: t('ui.feed.title'),
      description: t('ui.feed.description'),
      // The blog's own page in this locale, as the build mounted it: its URL never rewritten here.
      url:
        mountedUrls.find(
          (page) => page.kind === 'folder' && page.collection === 'blog' && page.locale === locale && page.key === '',
        )?.url ?? urlOf(locale),
      feed: urlOf(locale, ['feed.xml']),
      locale,
    },
    entries: posts.map(({ item, data }) => ({ url: item.url, locale: item.locale, alternates: item.alternates, data })),
    fields: metadataFields.blog,
    site,
    authors: (entry) => names.get(entry.url) ?? [],
    categories: (entry) => tags.get(entry.url) ?? [],
  });

  return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
}
