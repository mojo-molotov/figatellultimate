import { describe, expect, it } from 'vitest';

import { defineLocales, InvalidLocalesError } from '../locales.js';

describe('defineLocales', () => {
  it('returns a frozen declaration with the implicit notation by default', () => {
    const locales = defineLocales({ list: ['fr', 'en'], default: 'fr' });

    expect(locales).toMatchObject({ list: ['fr', 'en'], default: 'fr', notation: 'implicit' });
    expect(Object.isFrozen(locales)).toBe(true);
    expect(Object.isFrozen(locales.list)).toBe(true);
  });

  it('keeps the explicit notation when asked', () => {
    expect(defineLocales({ list: ['en'], default: 'en', notation: 'explicit' }).notation).toBe('explicit');
  });

  it.each<[string, unknown]>([
    ['an empty list', { list: [], default: 'fr' }],
    ['duplicate locales', { list: ['fr', 'fr'], default: 'fr' }],
    ['a default outside the list', { list: ['fr', 'en'], default: 'de' }],
    ['an uppercase code', { list: ['FR'], default: 'FR' }],
    ['a non-code name', { list: ['english'], default: 'english' }],
  ])('throws InvalidLocalesError on %s', (_, input) => {
    expect(() =>
      // @ts-expect-error -- an untyped (JS or JSON) caller: validated at runtime.
      defineLocales(input),
    ).toThrow(InvalidLocalesError);
  });

  it('accepts region subtags', () => {
    expect(defineLocales({ list: ['fr', 'pt-br'], default: 'pt-br' }).default).toBe('pt-br');
  });
});

describe('locale metadata', () => {
  it('declares labels and directions in the same place as the codes, in declaration order', () => {
    const locales = defineLocales({
      list: { fr: { label: 'Français' }, en: { label: 'English' }, ar: { label: 'العربية' } },
      default: 'fr',
    });

    expect(locales.list).toEqual(['fr', 'en', 'ar']);
    expect(locales.info).toEqual({
      fr: { label: 'Français', dir: 'ltr' },
      en: { label: 'English', dir: 'ltr' },
      ar: { label: 'العربية', dir: 'rtl' },
    });
    expect(Object.isFrozen(locales.info)).toBe(true);
    expect(Object.isFrozen(locales.info.fr)).toBe(true);
  });

  it('infers right-to-left from the language or the script, and lets the declaration override it', () => {
    const locales = defineLocales({
      list: { he: {}, 'fa-ir': {}, 'az-arab': {}, 'az-latn': {}, ug: { dir: 'ltr' } },
      default: 'he',
    });
    const dirs = Object.fromEntries(locales.list.map((code) => [code, locales.info[code].dir]));

    expect(dirs).toEqual({ he: 'rtl', 'fa-ir': 'rtl', 'az-arab': 'rtl', 'az-latn': 'ltr', ug: 'ltr' });
  });

  it("defaults the label to the locale's own name, also with the array form", () => {
    const locales = defineLocales({ list: ['fr', 'en'], default: 'fr' });

    expect(locales.info.fr.label).toBe('français');
    expect(locales.info.en.label).toBe('English');
  });

  it.each<[string, unknown]>([
    ['an empty label', { list: { fr: { label: ' ' } }, default: 'fr' }],
    ['an unknown direction', { list: { fr: { dir: 'up' } }, default: 'fr' }],
    ['an empty record', { list: {}, default: 'fr' }],
  ])('throws InvalidLocalesError on %s', (_, input) => {
    expect(() =>
      // @ts-expect-error -- an untyped (JS or JSON) caller: validated at runtime.
      defineLocales(input),
    ).toThrow(InvalidLocalesError);
  });
});
