import type { ReactNode } from 'react';
import { describe, expectTypeOf, it } from 'vitest';

import { EntryCard } from '../index.js';

const labels = { tags: 'Tags', authors: 'Auteurs', more: 'Autres tags' };

describe('EntryCard: its title at a heading level from 2 to 6', () => {
  it('takes a level from 2 to 6, never 1: the page title is the h1', () => {
    expectTypeOf(<EntryCard href="/a" title="A" locale="fr" labels={labels} headingLevel={3} />).toExtend<ReactNode>();
    // @ts-expect-error -- a card titled as the page itself.
    expectTypeOf(<EntryCard href="/a" title="A" locale="fr" labels={labels} headingLevel={1} />).toExtend<ReactNode>();
  });
});
