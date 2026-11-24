import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { cssString } from '../index.js';

/** A CSS string read back as a browser reads it: its escapes resolved, its quotes taken off. */
const read = (css: string): string =>
  css
    .slice(1, -1)
    .replaceAll(/\\(?:([0-9a-f]{1,6}) ?|(.))/gisu, (_, hex: string | undefined, character: string | undefined) =>
      hex === undefined ? (character ?? '') : String.fromCodePoint(Number.parseInt(hex, 16)),
    );

describe('cssString', () => {
  it('reads back as the value, line breaks as spaces, in one string that never closes its <style>', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (value) => {
        const css = cssString(value);

        expect(read(css)).toBe(value.replaceAll(/[\n\r]+/g, ' '));
        expect(css).not.toContain('<');
        expect(css).not.toMatch(/[\n\r]/);
        // One string: no quote inside left unescaped.
        expect(css.slice(1, -1)).not.toMatch(/(^|[^\\])(\\\\)*"/);
      }),
      { examples: [['Café « crème »'], ['</style><script>'], ['a"b\\c'], ['ligne\r\nsuivante']] },
    );
  });
});
