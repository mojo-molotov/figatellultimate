/** next-intl's locale routing, matching figatellu's URLs. */
import { defineRouting } from 'next-intl/routing';

import { defaultLocale, locales } from '#figatellu/locales';

/**
 * Locale routing by next-intl: figatellu does none. It mirrors figatellu's URL strategy (implicit
 * by default): the default locale unprefixed, the others under their prefix. `example:verify` checks they agree.
 * No locale detection: a URL always shows the same locale, as the canonical URLs and the sitemap say.
 */
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
  localeDetection: false,
});
