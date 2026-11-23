import { describe, expect, it } from 'vitest';

import { localeLinksOf, type MountedUrl } from '../index.js';

const item = (collection: string, key: string, locale: string, url: string): MountedUrl => ({
  collection,
  key,
  locale,
  url,
  alternates: {},
});

/** fr default: the home in both locales, docs in French only, a translated page under docs, a blog post. */
const URLS: readonly MountedUrl[] = [
  { ...item('pages', '', 'fr', '/'), alternates: { fr: '/', en: '/en' }, home: true },
  { ...item('pages', '', 'en', '/en'), alternates: { fr: '/', en: '/en' }, home: true },
  item('pages', 'docs', 'fr', '/docs'),
  { ...item('pages', 'docs/setup', 'fr', '/docs/setup'), alternates: { fr: '/docs/setup', en: '/en/docs/setup' } },
  { ...item('pages', 'docs/setup', 'en', '/en/docs/setup'), alternates: { fr: '/docs/setup', en: '/en/docs/setup' } },
  item('pages', 'docs/advanced/tuning', 'fr', '/docs/advanced/tuning'),
  item('pages', 'guides', 'en', '/en/guides'),
  item('blog', 'news/bot/post-01', 'fr', '/blog/news/bot/post-01'),
];
const LOCALES = ['fr', 'en', 'de'];

describe('localeLinksOf', () => {
  it('links the translation when it exists, the current locale marked', () => {
    expect(localeLinksOf('/docs/setup', URLS, LOCALES)).toEqual([
      { locale: 'fr', url: '/docs/setup', kind: 'entry', current: true },
      { locale: 'en', url: '/en/docs/setup', kind: 'entry', current: false },
    ]);
  });

  it('falls back to the nearest translated ancestor, then to that locale’s home', () => {
    const links = localeLinksOf('/docs/advanced/tuning', URLS, LOCALES);

    // English: no tuning, no advanced, no docs in English → the English home.
    expect(links).toContainEqual({ locale: 'en', url: '/en', kind: 'home', current: false });
    const fromEnglish = localeLinksOf('/en/guides', URLS, LOCALES);

    expect(fromEnglish).toContainEqual({ locale: 'fr', url: '/', kind: 'home', current: false });
  });

  it('uses an ancestor of the same collection when one is translated', () => {
    const urls = [...URLS, item('pages', 'docs', 'en', '/en/docs')];

    expect(localeLinksOf('/docs/advanced/tuning', urls, LOCALES)).toContainEqual({
      locale: 'en',
      url: '/en/docs',
      kind: 'ancestor',
      current: false,
    });
  });

  it('never links a URL that is not mounted: a locale without any page is left out', () => {
    const links = localeLinksOf('/blog/news/bot/post-01', URLS, LOCALES);
    const mounted = new Set(URLS.map((u) => u.url));

    for (const link of links) expect(mounted.has(link.url)).toBe(true);

    // German has no page at all.
    expect(links.map((l) => l.locale)).toEqual(['fr', 'en']);
  });

  it('from a URL that is not mounted (an app route), gives each locale’s home, none current', () => {
    expect(localeLinksOf('/blog/news/bot', URLS, LOCALES)).toEqual([
      { locale: 'fr', url: '/', kind: 'home', current: false },
      { locale: 'en', url: '/en', kind: 'home', current: false },
    ]);
  });

  it('returns frozen links', () => {
    const links = localeLinksOf('/docs/setup', URLS, LOCALES);

    expect(Object.isFrozen(links) && links.every((l) => Object.isFrozen(l))).toBe(true);
  });
});

describe('localeLinksOf, on a build’s many pages', () => {
  it('reads the mounted URLs once per array, not once per page: a build is linear, never quadratic', () => {
    // Scanning every URL for each page once made a build of 11,000 pages spend 14 s on its locale links.
    let reads = 0;
    const copy = [...URLS];
    const counted = new Proxy(copy, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) reads += 1;

        const value: unknown = Reflect.get(target, property, receiver);

        return value;
      },
    });
    const first = localeLinksOf('/docs/setup', counted, LOCALES);
    const once = reads;

    for (const item of URLS) localeLinksOf(item.url, counted, LOCALES);

    // Precondition: the first call did read them, and gave the same links as on the plain array.
    expect(once).toBeGreaterThanOrEqual(URLS.length);
    expect(first).toEqual(localeLinksOf('/docs/setup', URLS, LOCALES));
    expect(reads).toBe(once);
  });

  it('keeps the first of a URL and of a home, as a search would: a duplicate never takes their place', () => {
    const twice = [
      ...URLS,
      { ...item('pages', '', 'en', '/en/other-home'), home: true as const },
      item('pages', 'docs', 'fr', '/docs'),
    ];

    expect(localeLinksOf('/nowhere', twice, ['en'])).toEqual([
      { locale: 'en', url: '/en', kind: 'home', current: false },
    ]);
  });
});

describe('localeLinksOf: the home', () => {
  it('is the home the build marks, never another page with an empty key, whatever the order', () => {
    // A collection's own page (the blog's, a folder page) has an empty key too: listed first, it once took the home's
    // place, and the switcher of an app route led to the blog.
    const blogFirst = [item('blog', '', 'fr', '/blog'), item('blog', '', 'en', '/en/blog'), ...URLS];

    expect(localeLinksOf('/search', blogFirst, ['fr', 'en'])).toEqual([
      { locale: 'fr', url: '/', kind: 'home', current: false },
      { locale: 'en', url: '/en', kind: 'home', current: false },
    ]);
  });
});
