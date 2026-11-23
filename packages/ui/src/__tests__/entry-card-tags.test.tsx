// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import * as fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';

import { EntryCardTags, fittingTags } from '../entry-card-tags.js';

afterEach(cleanup);

describe('fittingTags', () => {
  it.each([
    ['every tag fits: no pill', [40, 40, 40], 200, 8, 30, 3],
    ['the third does not: two, then the pill', [60, 60, 60], 190, 8, 30, 2],
    ['not even the first beside the pill: the pill alone', [180, 20], 100, 8, 30, 0],
    ['exactly the room, with its gaps', [50, 50], 108, 8, 30, 2],
  ])('%s', (_, widths, room, gap, pill, expected) => {
    expect(fittingTags(widths, room, gap, pill)).toBe(expected);
  });

  it('shows whole tags only, the pill beside them within the room, and as many as can be', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 120 }), { maxLength: 8 }),
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 12 }),
        fc.integer({ min: 1, max: 60 }),
        (widths, room, gap, pill) => {
          const shown = fittingTags(widths, room, gap, pill);
          const width = (count: number): number =>
            widths.slice(0, count).reduce((sum, w) => sum + w, 0) + gap * Math.max(0, count - 1);

          expect(shown).toBeGreaterThanOrEqual(0);
          expect(shown).toBeLessThanOrEqual(widths.length);

          if (shown === widths.length) {
            // All of them: they fit alone, without a pill.
            expect(width(shown)).toBeLessThanOrEqual(room);
          } else {
            // Some hidden: those shown and the pill fit, one more would not.
            expect(width(shown) + (shown > 0 ? gap : 0) + pill).toBeLessThanOrEqual(Math.max(room, pill));
            expect(width(shown + 1) + gap + pill).toBeGreaterThan(room);
          }
        },
      ),
    );
  });
});

/** In a real browser (the browser family), layout runs: the row is measured at once, and no render precedes it. */
const inBrowser = !navigator.userAgent.includes('HappyDOM');

describe('EntryCardTags', () => {
  // The state before any measure, the prerendered row's: only happy-dom, without layout, holds it long enough.
  it.skipIf(inBrowser)(
    'lists every tag, named by its label, before any measure: the prerendered row, its pill hidden',
    () => {
      render(
        <EntryCardTags
          tags={[
            { key: 'kalimba', label: 'Kalimba' },
            { key: 'violin', label: 'Violon' },
          ]}
          labels={{ tags: 'Tags', more: 'Autres tags' }}
          locale="fr"
        />,
      );

      expect(screen.getByRole('list', { name: 'Tags' }).textContent).toContain('KalimbaViolon');
      expect(screen.queryByRole('button', { name: 'Autres tags' })).toBeNull();
    },
  );
});
