import type { Heading } from '@figatellultimate/toc';
import type { ReactNode } from 'react';
import { describe, expectTypeOf, it } from 'vitest';

import { TableOfContents } from '../index.js';

declare const headings: readonly Heading[];

describe('TableOfContents labels', () => {
  it('requires its title: no English default', () => {
    expectTypeOf(<TableOfContents headings={headings} labels={{ title: 'Sur cette page' }} />).toExtend<ReactNode>();
    // @ts-expect-error -- the title is required.
    expectTypeOf(<TableOfContents headings={headings} labels={{}} />).toExtend<ReactNode>();
  });
});
