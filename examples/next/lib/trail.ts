/** Where a page sits, shown under its search result (`formatTrail` of `@figatellultimate/site`). */
import { breadcrumbOf, formatTrail } from '@figatellultimate/site';
import { getTranslations } from 'next-intl/server';

import { localeInfo, type Locale } from '#figatellultimate/locales';
import { navigationOf } from '#figatellultimate/navigation';

/**
 * Where a page sits, for its search result: its breadcrumb without the home nor the page itself, translated and joined
 * by a directional chevron (`›` left to right, `‹` right to left); `undefined` for a page right under the home.
 */
export async function trailOf(locale: Locale, url: string): Promise<string | undefined> {
  const t = await getTranslations({ locale });

  return formatTrail(breadcrumbOf(navigationOf(locale), url), t, localeInfo[locale].dir);
}
