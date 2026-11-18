/** The locale proxy: unprefixed URLs served in the default locale. */
import createMiddleware from 'next-intl/middleware';

import { routing } from './i18n/routing';

// next-intl's locale routing: `/docs` is served by `app/[locale]` with the default locale.
export default createMiddleware(routing);

export const config = {
  // Pages only: not Next's own files, the search bundles, nor files with an extension (sitemap.xml, images); but the
  // default locale's feed, served unprefixed like its pages.
  matcher: ['/((?!_next|pagefind|.*\\..*).*)', '/feed.xml'],
};
