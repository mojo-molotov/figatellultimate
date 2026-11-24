/** The site's `llms-full.txt`, one per locale: every exposed page's Markdown in one file, an extra to llms.txt. */
import { llmsFullOf, markdownUrlOf } from '@figatellultimate/site';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';

import { locales } from '#figatellultimate/locales';

import { exposedPagesOf } from '../../../components/llms';
import { routing } from '../../../i18n/routing';
import { site } from '../../../site';

// One per locale, prerendered, beside its `llms.txt`: `/llms-full.txt` (the proxy serves the default locale's) and
// `/en/llms-full.txt`.
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
  const text = llmsFullOf({
    title: site.name ?? site.origin,
    summary: t('ui.llms.summary'),
    pages: pages.map((page) => ({ url: markdownUrlOf(page.url), markdown: page.markdown })),
    site,
  });

  return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
