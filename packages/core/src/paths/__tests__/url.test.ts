import { describe, expect, it } from 'vitest';

import { createUrlBuilder, InvalidUrlOptionsError } from '../url.js';
import { locales } from '../../__tests__/scenarios/collections.js';

describe('createUrlBuilder', () => {
  it.each([
    // [locale, route, options, expected]
    ['fr', '/docs/setup', {}, '/docs/setup'],
    ['en', '/docs/setup', {}, '/en/docs/setup'],
    ['fr', '/', {}, '/'],
    ['en', '/', {}, '/en'],
    ['fr', '/docs/setup', { defaultLocale: 'explicit' }, '/fr/docs/setup'],
    ['fr', '/', { defaultLocale: 'explicit' }, '/fr'],
    ['en', '/docs/setup', { trailingSlash: true }, '/en/docs/setup/'],
    ['fr', '/', { trailingSlash: true }, '/'],
    ['en', '/', { defaultLocale: 'explicit', trailingSlash: true }, '/en/'],
  ] as const)('%s %s %j → %s', (locale, route, options, expected) => {
    expect(createUrlBuilder(locales, options).url({ locale, route })).toBe(expected);
  });

  it('is built once from data: the resolved options are exposed and frozen', () => {
    const urls = createUrlBuilder(locales);

    expect(urls.options).toEqual({ defaultLocale: 'implicit', trailingSlash: false });
    expect(urls.locales).toBe(locales);
    expect(Object.isFrozen(urls)).toBe(true);
    expect(Object.isFrozen(urls.options)).toBe(true);
  });

  it('throws InvalidUrlOptionsError on invalid options', () => {
    expect(() =>
      // @ts-expect-error -- an untyped (JS or JSON) caller: validated at runtime.
      createUrlBuilder(locales, { defaultLocale: 'prefixed' }),
    ).toThrow(InvalidUrlOptionsError);
    expect(() =>
      // @ts-expect-error -- an untyped (JS or JSON) caller: validated at runtime.
      createUrlBuilder(locales, { trailingSlash: 'yes' }),
    ).toThrow(InvalidUrlOptionsError);
  });
});
