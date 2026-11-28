/**
 * Each exposed page's Markdown, prerendered: what llms.txt links. The proxy serves it at the page's URL with `.md`
 * appended (`/docs/cli.md`, `/en/docs/cli.md`); this route's own path is never linked.
 */
import { hasLocale } from 'next-intl';

import { mountedUrls, segmentsOf, urlOf } from '#figatellultimate/urls';

import { exposedMarkdownOf } from '../../../../lib/llms';
import { routing } from '../../../../i18n/routing';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams(): { locale: string; url: string[] }[] {
  return mountedUrls
    .filter((item) => item.llms)
    .map((item) => ({ locale: item.locale, url: segmentsOf(item.url, item.locale) }));
}

export async function GET(
  _: Request,
  context: { readonly params: Promise<{ readonly locale: string; readonly url?: string[] | undefined }> },
): Promise<Response> {
  const { locale, url } = await context.params;

  if (!hasLocale(routing.locales, locale)) return new Response(null, { status: 404 });

  const markdown = await exposedMarkdownOf(urlOf(locale, url ?? []));

  return markdown === undefined
    ? new Response(null, { status: 404 })
    : new Response(markdown, { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
}
