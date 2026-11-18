import type { ReactNode } from 'react';
import { describe, expectTypeOf, it } from 'vitest';

import { CodeBlock } from '../index.js';

describe('CodeBlock: no text of its own', () => {
  it('requires both labels', () => {
    expectTypeOf(<CodeBlock labels={{ copy: 'Copier', copied: 'Copié' }} />).toExtend<ReactNode>();
    // @ts-expect-error -- the confirmation would not be announced in the page's language.
    expectTypeOf(<CodeBlock labels={{ copy: 'Copier' }} />).toExtend<ReactNode>();
    // @ts-expect-error -- the button would have no name.
    expectTypeOf(<CodeBlock />).toExtend<ReactNode>();
  });
});
