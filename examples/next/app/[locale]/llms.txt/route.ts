/** The site's `llms.txt`, one per locale (https://llmstxt.org): its exposed pages, linked by their Markdown. */
import { llmsTxtOf, markdownUrlOf } from '@figatellultimate/site';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';

import { locales } from '#figatellultimate/locales';

import { exposedPagesOf } from '../../../components/llms';
import { routing } from '../../../i18n/routing';
import { site } from '../../../site';

// One per locale, prerendered: `/llms.txt` (the proxy serves the default locale's) and `/en/llms.txt`, each covering
// its locale's pages, the most specific one for an agent.
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
  const pages = await exposedPagesOf(locale);
  const text = llmsTxtOf({
    title: site.name ?? site.origin,
    summary: t('ui.llms.summary'),
    sections: [
      {
        title: t('ui.llms.docs'),
        links: pages.map((page) => ({ title: page.title, url: markdownUrlOf(page.url), notes: page.description })),
      },
    ],
    site,
  });

  return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
