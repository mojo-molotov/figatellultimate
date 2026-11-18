/** The JSON-LD of a page, and its breadcrumb's. */
import { breadcrumbListOf, breadcrumbOf, jsonLd, type StructuredData } from '@figatellu/site';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import type { Locale } from '#figatellu/locales';
import { navigationOf } from '#figatellu/navigation';

import { site } from '../site';

/** schema.org data in the page, escaped by `jsonLd`: no value can close its script. */
export function StructuredDataScript({ data }: { readonly data: readonly StructuredData[] }): ReactNode {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />;
}

/** A page's `BreadcrumbList`: the same steps as its visible breadcrumb, labels translated. */
export async function breadcrumbDataOf(locale: Locale, url: string, title?: string): Promise<StructuredData> {
  const t = await getTranslations({ locale });
  const crumbs = breadcrumbOf(navigationOf(locale), url, title).map((crumb) => ({
    label: crumb.message ? t(crumb.label) : crumb.label,
    url: crumb.url,
  }));

  return breadcrumbListOf(crumbs, site);
}
