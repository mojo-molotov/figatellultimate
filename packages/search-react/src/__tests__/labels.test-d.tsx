import type { Search } from '@figatellultimate/search';
import type { ReactNode } from 'react';
import { describe, expectTypeOf, it } from 'vitest';

import { SearchBox, type SearchBoxLabels } from '../index.js';

declare const search: Search<'pages' | 'blog'>;
declare const labels: SearchBoxLabels<'pages' | 'blog'>;

describe('SearchBox is typed by its collections', () => {
  it('labels name the collections of the search', () => {
    expectTypeOf<SearchBoxLabels<'pages' | 'blog'>['collection']>().parameter(0).toEqualTypeOf<'pages' | 'blog'>();
    expectTypeOf(
      <SearchBox search={search} filter={{ collections: ['blog'], label: 'Filter' }} labels={labels} />,
    ).toExtend<ReactNode>();
  });

  it('the filter is optional, and its label comes with it', () => {
    expectTypeOf(<SearchBox search={search} labels={labels} />).toExtend<ReactNode>();
    const unnamed = { collections: ['blog'] } as const;

    // @ts-expect-error -- a filter without its accessible name.
    expectTypeOf(<SearchBox search={search} filter={unnamed} labels={labels} />).toExtend<ReactNode>();
  });

  it('an unknown collection, or missing labels, do not compile', () => {
    const docs = { collections: ['docs'], label: 'Filter' } as const;

    // @ts-expect-error -- 'docs' is not a collection of this search.
    expectTypeOf(<SearchBox search={search} filter={docs} labels={labels} />).toExtend<ReactNode>();
    const { more: _more, ...withoutMore } = labels;

    expectTypeOf(_more).toBeString();
    // @ts-expect-error -- `more` is missing: no English default.
    expectTypeOf(<SearchBox search={search} labels={withoutMore} />).toExtend<ReactNode>();
  });
});
