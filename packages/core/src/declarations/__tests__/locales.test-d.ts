import { describe, expectTypeOf, it } from 'vitest';

import { defineLocales, type Locales } from '../locales.js';

describe('defineLocales (types)', () => {
  it('infers the locale union and the default locale', () => {
    const locales = defineLocales({ list: ['fr', 'en'], default: 'fr' });

    expectTypeOf(locales).toEqualTypeOf<Locales<'fr' | 'en', 'fr'>>();
    expectTypeOf(locales.list).toEqualTypeOf<readonly ('fr' | 'en')[]>();
  });

  it('rejects a default locale outside the list', () => {
    // @ts-expect-error 'de' is not a declared locale
    defineLocales({ list: ['fr', 'en'], default: 'de' });
  });
});

describe('defineLocales with metadata (types)', () => {
  it('infers the locale union from the record keys', () => {
    const locales = defineLocales({ list: { fr: { label: 'Français' }, en: {} }, default: 'en' });

    expectTypeOf(locales).toEqualTypeOf<Locales<'fr' | 'en', 'en'>>();
    expectTypeOf(locales.info.fr.dir).toEqualTypeOf<'ltr' | 'rtl'>();
  });

  it('rejects a default locale outside the record', () => {
    // @ts-expect-error 'de' is not a declared locale
    defineLocales({ list: { fr: {} }, default: 'de' });
  });
});
