import type { ReactNode } from 'react';
import { describe, expectTypeOf, it } from 'vitest';

import { ImageZoom } from '../index.js';

describe('ImageZoom: no text of its own', () => {
  it('requires both labels, the open one built from the alt', () => {
    const labels = { open: (alt: string) => `Agrandir : ${alt}`, close: 'Fermer' };

    expectTypeOf(<ImageZoom labels={labels} src="/a.png" alt="A" />).toExtend<ReactNode>();
    // @ts-expect-error -- the close button would have no name.
    expectTypeOf(<ImageZoom labels={{ open: labels.open }} src="/a.png" alt="A" />).toExtend<ReactNode>();
    const fixed = { open: 'Agrandir', close: 'Fermer' };

    // @ts-expect-error -- a fixed string would not say which image opens.
    expectTypeOf(<ImageZoom labels={fixed} src="/a.png" alt="A" />).toExtend<ReactNode>();
  });
});
