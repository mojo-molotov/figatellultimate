import { describe, expectTypeOf, it } from 'vitest';

import { defineCollection } from '../collection.js';
import { join, locale, segment, slug, type SegmentNames } from '../grammar.js';
import type { blog, pages } from '../../__tests__/scenarios/collections.js';

describe('defineCollection (types)', () => {
  it('infers segment names as literal types (base of the generated getters)', () => {
    expectTypeOf<SegmentNames<typeof blog.grammar>>().toEqualTypeOf<'category' | 'subcategory'>();
    expectTypeOf<SegmentNames<typeof pages.grammar>>().toEqualTypeOf<'path'>();
    expectTypeOf<(typeof blog)['entry']>().toEqualTypeOf<'blogPost'>();
  });

  it('rejects routes and index positions naming unknown segments', () => {
    const grammar = [segment('category'), locale({ optional: true }), slug()] as const;

    defineCollection({ entry: 'lp', base: 'lp', grammar, route: [join('-', 'category', 'slug')] });
    // @ts-expect-error 'nope' is not a segment of this grammar
    defineCollection({ entry: 'lp', base: 'lp', grammar, route: [join('-', 'category', 'nope')] });
    // @ts-expect-error 'nope' is not a segment of this grammar
    defineCollection({ entry: 'lp', base: 'lp', grammar, route: ['nope'] });
    // @ts-expect-error 'nope' is not a segment of this grammar
    defineCollection({ entry: 'lp', base: 'lp', grammar, indexForbiddenUnder: ['nope'] });
    // @ts-expect-error the root is not a segment: use indexForbiddenAtRoot
    defineCollection({ entry: 'lp', base: 'lp', grammar, indexForbiddenUnder: [''] });
  });
});
