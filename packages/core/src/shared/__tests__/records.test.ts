import { describe, expect, expectTypeOf, it } from 'vitest';

import { recordFrom } from '../records.js';

describe('recordFrom', () => {
  it('gives one value per key, in the keys’ order, frozen and typed by its keys', () => {
    const record = recordFrom(['fr', 'en'], (code) => code.toUpperCase());

    expect(record).toEqual({ fr: 'FR', en: 'EN' });
    expect(Object.keys(record)).toEqual(['fr', 'en']);
    expect(Object.isFrozen(record)).toBe(true);
    expectTypeOf(record).toEqualTypeOf<Readonly<Record<'fr' | 'en', string>>>();
  });
});
