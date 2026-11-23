/**
 * Every text of a listing (server): formatted here, and, for those that take a count or a page, precompiled for the
 * client listing to format (`components/format.ts`). The listing never imports next-intl.
 */
import { getTranslations } from 'next-intl/server';

import type { Locale } from '#figatellultimate/locales';
import { taxonomies } from '#figatellultimate/taxonomies';

import type { Precompiled } from '@figatellultimate/use-intl/precompile';
import { compiled } from '../i18n/labels';
import { SORTS } from './facets';

/** A facet's texts: its trigger takes the count of selected terms. */
export interface FacetLabels<N extends 'tags' | 'authors' = 'tags' | 'authors'> {
  readonly trigger: Precompiled<`ui.facets.${N}.trigger`>;
  readonly filter: string;
  readonly list: string;
  readonly empty: string;
  readonly clear: string;
  /** Each term's name. */
  readonly terms: Readonly<Record<string, string>>;
}

/** Every text of a listing. */
export interface ListingLabels {
  readonly facets: { readonly tags: FacetLabels<'tags'>; readonly authors: FacetLabels<'authors'> };
  readonly sort: { readonly trigger: string; readonly names: Readonly<Record<string, string>> };
  readonly reset: string;
  /** The gear holding the facets and the sort: its name takes the count of selected terms; its panel's name. */
  readonly options: { readonly trigger: Precompiled<'ui.options.trigger'>; readonly content: string };
  /** How many posts the filters give. */
  readonly total: Precompiled<'ui.listing.total'>;
  readonly pagination: {
    readonly nav: string;
    readonly previous: string;
    readonly next: string;
    readonly page: Precompiled<'ui.pagination.page'>;
    readonly current: Precompiled<'ui.pagination.current'>;
    readonly more: Precompiled<'ui.pagination.more'>;
    /** The compact pagination's name, and what it shows. */
    readonly jump: string;
    readonly short: Precompiled<'ui.pagination.short'>;
  };
}

/**
 * A listing's texts in a locale.
 *
 * @param locale - The page's locale.
 * @returns The texts, formatted or precompiled.
 */
export async function listingLabels(locale: Locale): Promise<ListingLabels> {
  const t = await getTranslations({ locale });

  return {
    facets: {
      tags: {
        trigger: await compiled(locale, 'ui.facets.tags.trigger'),
        filter: t('ui.facets.tags.filter'),
        list: t('ui.facets.tags.list'),
        empty: t('ui.facets.tags.empty'),
        clear: t('ui.facets.tags.clear'),
        terms: Object.fromEntries(taxonomies.tags.terms.map((term) => [term, t(`taxonomies.tags.${term}.label`)])),
      },
      authors: {
        trigger: await compiled(locale, 'ui.facets.authors.trigger'),
        filter: t('ui.facets.authors.filter'),
        list: t('ui.facets.authors.list'),
        empty: t('ui.facets.authors.empty'),
        clear: t('ui.facets.authors.clear'),
        terms: Object.fromEntries(taxonomies.authors.terms.map((term) => [term, t(`taxonomies.authors.${term}.name`)])),
      },
    },
    sort: {
      trigger: t('ui.sort.trigger'),
      names: Object.fromEntries(SORTS.map((sort) => [sort, t(`ui.sort.${sort}`)])),
    },
    reset: t('ui.reset'),
    options: { trigger: await compiled(locale, 'ui.options.trigger'), content: t('ui.options.content') },
    total: await compiled(locale, 'ui.listing.total'),
    pagination: {
      nav: t('ui.pagination.nav'),
      previous: t('ui.pagination.previous'),
      next: t('ui.pagination.next'),
      page: await compiled(locale, 'ui.pagination.page'),
      current: await compiled(locale, 'ui.pagination.current'),
      more: await compiled(locale, 'ui.pagination.more'),
      jump: t('ui.pagination.jump'),
      short: await compiled(locale, 'ui.pagination.short'),
    },
  };
}
