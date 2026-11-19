/** Where a page sits, shown under its search result. */
import { breadcrumbOf } from '@figatellultimate/site';
import { getTranslations } from 'next-intl/server';

import type { Locale } from '#figatellultimate/locales';
import { navigationOf } from '#figatellultimate/navigation';

/**
 * Where a page sits, for its search result: its breadcrumb without the home (every page is under it) nor the page
 * itself (the result's title already names it), its labels translated; `undefined` for a page right under the home.
 */
export async function trailOf(locale: Locale, url: string): Promise<string | undefined> {
  const t = await getTranslations({ locale });
  const steps = breadcrumbOf(navigationOf(locale), url)
    .slice(1)
    .filter((crumb) => !crumb.current)
    .map((crumb) => (crumb.message ? t(crumb.label) : crumb.label));

  return steps.length === 0 ? undefined : steps.join(' › ');
}
