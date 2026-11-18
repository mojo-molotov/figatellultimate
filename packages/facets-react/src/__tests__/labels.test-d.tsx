import type { ReactNode } from 'react';
import { describe, expectTypeOf, it } from 'vitest';

import {
  Pagination,
  SortSelect,
  type FacetedCollectionBinding,
  type FacetOptionsLabels,
  type PaginationLabels,
  type SortSelectLabels,
} from '../index.js';

declare const binding: FacetedCollectionBinding;

const pagination: PaginationLabels = {
  nav: 'Pagination',
  previous: 'Précédente',
  next: 'Suivante',
  page: (n) => `Page ${String(n)}`,
  current: (n, total) => `Page ${String(n)} sur ${String(total)}`,
  more: (pages) => `Pages ${pages.join(', ')}`,
};

describe('labels are required and typed', () => {
  it('a complete set compiles', () => {
    expectTypeOf(<Pagination binding={binding} labels={pagination} locale="fr" />).toExtend<ReactNode>();
  });

  it('a missing label does not compile: there is no English default', () => {
    const withoutNav: Omit<PaginationLabels, 'nav'> = pagination;

    // @ts-expect-error -- `nav` is missing.
    expectTypeOf(<Pagination binding={binding} labels={withoutNav} locale="fr" />).toExtend<ReactNode>();
    // @ts-expect-error -- no labels at all.
    expectTypeOf(<SortSelect binding={binding} />).toExtend<ReactNode>();
    const withoutClear: Omit<FacetOptionsLabels, 'clear'> = {
      trigger: () => '',
      filter: '',
      list: '',
      empty: '',
      term: (term) => term,
    };

    // @ts-expect-error -- `clear` is missing.
    expectTypeOf(withoutClear).toExtend<FacetOptionsLabels>();
  });

  it('the locale is required: numbers are formatted for it', () => {
    // @ts-expect-error -- no locale.
    expectTypeOf(<Pagination binding={binding} labels={pagination} />).toExtend<ReactNode>();
  });

  it('a label of the wrong shape does not compile', () => {
    // @ts-expect-error -- `page` depends on the page number: a function, not a string.
    expectTypeOf({ ...pagination, page: 'Page' }).toExtend<PaginationLabels>();
    expectTypeOf<SortSelectLabels['sort']>().parameter(0).toEqualTypeOf<string>();
    expectTypeOf<FacetOptionsLabels['term']>().parameter(0).toEqualTypeOf<string>();
  });
});
