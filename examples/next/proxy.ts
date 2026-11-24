/** The locale proxy: unprefixed URLs served in the default locale; a page's Markdown served at its URL with `.md`. */
import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';

import { routing } from './i18n/routing';

// next-intl's locale routing: `/docs` is served by `app/[locale]` with the default locale.
const locales = createMiddleware(routing);

/**
 * The route serving a page's Markdown (`app/[locale]/llms`), from the URL llms.txt links: the page's URL with `.md`
 * appended (`/en/docs/cli.md`), or `index.md` for the home (`markdownUrlOf` of `@figatellultimate/site`).
 *
 * @param pathname - The requested path, ending with `.md`.
 * @returns The route's path, under the page's locale (the default one when unprefixed).
 */
function markdownRoute(pathname: string): string {
  const segments = pathname.slice(1, -'.md'.length).split('/');

  if (segments.at(-1) === 'index') segments.pop();

  const [first, ...rest] = segments;
  const prefixed = routing.locales.find((locale) => locale === first);
  const path = prefixed === undefined ? segments : rest;

  return `/${prefixed ?? routing.defaultLocale}/llms${path.length === 0 ? '' : `/${path.join('/')}`}`;
}

/**
 * The proxy: a page's Markdown to its route, every other page to next-intl.
 *
 * @param request - The request.
 * @returns A rewrite to the Markdown route, or next-intl's answer.
 */
export default function proxy(request: NextRequest): Response {
  const { pathname } = request.nextUrl;

  if (!pathname.endsWith('.md')) return locales(request);

  const url = request.nextUrl.clone();

  url.pathname = markdownRoute(pathname);

  return NextResponse.rewrite(url);
}

export const config = {
  // Pages only: not Next's own files, the search bundles, nor files with an extension (sitemap.xml, images); but the
  // default locale's feed and llms files, served unprefixed like its pages, and each page's Markdown (`.md`).
  matcher: [
    '/((?!_next|pagefind|.*\\..*).*)',
    '/feed.xml',
    '/llms.txt',
    '/llms-full.txt',
    '/((?!_next|pagefind).*\\.md)',
  ],
};
