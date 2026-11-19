import { describe, expect, it } from 'vitest';

import { catchAllParamsOf, metadataOf, pageMetadataOf, sitemapOf } from '../index.js';
import type { MetadataFields, Site, SiteEntryWithData } from '../types.js';

const site: Site = { origin: 'https://example.com/', name: 'RTM', defaultLocale: 'fr' };
const fields: MetadataFields = {
  title: 'title',
  description: 'metadescription',
  image: 'featuredPictureUrl',
  publishedTime: 'date',
  tags: 'tags',
  type: 'article',
};

const english: SiteEntryWithData = {
  url: '/en/blog/patch-notes/bot/post-02',
  locale: 'en',
  alternates: { fr: '/blog/patch-notes/bot/post-02', en: '/en/blog/patch-notes/bot/post-02' },
  data: {
    title: 'The bot speaks',
    metadescription: 'What changed',
    featuredPictureUrl: '/img/bot.png',
    date: '2026-11-12',
    tags: ['release', 'bot'],
  },
};

describe('metadataOf', () => {
  it('builds canonical, alternates, x-default and Open Graph from the declared fields, as absolute URLs', () => {
    expect(metadataOf(english, fields, site)).toEqual({
      title: 'The bot speaks · RTM',
      description: 'What changed',
      canonical: 'https://example.com/en/blog/patch-notes/bot/post-02',
      alternates: {
        fr: 'https://example.com/blog/patch-notes/bot/post-02',
        en: 'https://example.com/en/blog/patch-notes/bot/post-02',
      },
      xDefault: 'https://example.com/blog/patch-notes/bot/post-02',
      openGraph: {
        type: 'article',
        url: 'https://example.com/en/blog/patch-notes/bot/post-02',
        locale: 'en',
        alternateLocales: ['fr'],
        title: 'The bot speaks',
        description: 'What changed',
        siteName: 'RTM',
        images: ['https://example.com/img/bot.png'],
        publishedTime: '2026-11-12',
        tags: ['release', 'bot'],
      },
    });
  });

  it('x-default is the default locale’s URL, and absent when that translation does not exist', () => {
    const englishOnly: SiteEntryWithData = { ...english, alternates: { en: english.url } };
    const result = metadataOf(englishOnly, fields, site);

    expect(result.xDefault).toBeUndefined();
    expect(result.alternates).toEqual({ en: 'https://example.com/en/blog/patch-notes/bot/post-02' });
    // In the default locale, x-default is the entry itself (not looked up in the current locale).
    const french = { ...english, url: '/blog/patch-notes/bot/post-02', locale: 'fr' };

    expect(metadataOf(french, fields, site).xDefault).toBe('https://example.com/blog/patch-notes/bot/post-02');
  });

  it('returns frozen objects and never mutates the entry or the site', () => {
    const snapshot = JSON.stringify([english, fields, site]);
    const first = metadataOf(english, fields, site);

    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.openGraph)).toBe(true);
    expect(Object.isFrozen(first.alternates)).toBe(true);
    expect(JSON.stringify([english, fields, site])).toBe(snapshot);
  });

  it('is deterministic, with no state kept between calls', () => {
    const calls = [metadataOf(english, fields, site), metadataOf(english, fields, site)];

    expect(calls[1]).toEqual(calls[0]);
    expect(calls[1]).not.toBe(calls[0]);
  });

  it('omits what the entry does not provide, keeps absolute images as they are, and defaults to website', () => {
    const page: SiteEntryWithData = {
      url: '/about',
      locale: 'fr',
      alternates: { fr: '/about' },
      data: { featuredPictureUrl: 'https://cdn.example.com/a.png' },
    };

    expect(metadataOf(page, { image: 'featuredPictureUrl' }, site)).toEqual({
      // Untitled: the site's name alone.
      title: 'RTM',
      canonical: 'https://example.com/about',
      alternates: { fr: 'https://example.com/about' },
      xDefault: 'https://example.com/about',
      openGraph: {
        type: 'website',
        url: 'https://example.com/about',
        locale: 'fr',
        alternateLocales: [],
        siteName: 'RTM',
        images: ['https://cdn.example.com/a.png'],
      },
    });
  });
});

describe('metadataOf: the title carries the site’s name', () => {
  it('follows the page’s title with the site’s name; Open Graph keeps the page’s own, the name being site_name', () => {
    const result = metadataOf(english, fields, site);

    expect(result.title).toBe('The bot speaks · RTM');
    expect(result.openGraph.title).toBe('The bot speaks');
  });

  it.each([
    ['the default locale', '/', 'fr'],
    ['another locale', '/en', 'en'],
  ])('titles the home page of %s with the site’s name alone', (_, url, locale) => {
    const home = { url, locale, alternates: { [locale]: url }, data: { title: 'Home' } };

    expect(metadataOf(home, fields, site).title).toBe('RTM');
  });

  it('applies the site’s own template, `%s` standing for the page’s title', () => {
    const titled = metadataOf(english, fields, { ...site, titleTemplate: '%s | RTM, the bot' });

    expect(titled.title).toBe('The bot speaks | RTM, the bot');
  });

  it('keeps the page’s title alone when the site has no name', () => {
    const nameless: Site = { origin: site.origin, defaultLocale: site.defaultLocale };

    expect(metadataOf(english, fields, nameless).title).toBe('The bot speaks');
  });
});

describe('metadataOf: the description, plain', () => {
  it('turns the French no-break spaces into plain spaces, in the meta description and Open Graph only', () => {
    const typeset = 'Tout sur Sartinu\u00a0: son habitat, ses attaques\u202f; et son kvas\u202f!';
    const result = metadataOf({ ...english, data: { ...english.data, metadescription: typeset } }, fields, site);

    // Precondition: the source is typeset, so that leaving it as it is cannot pass.
    expect(typeset).toMatch(/[\u00a0\u202f]/);
    expect(result.description).toBe('Tout sur Sartinu : son habitat, ses attaques ; et son kvas !');
    expect(result.openGraph.description).toBe(result.description);
  });
});

describe('metadataOf: robots and canonical overrides', () => {
  const seoFields: MetadataFields = { ...fields, robots: 'robots', canonical: 'canonical', modifiedTime: 'updated' };

  it('passes the robots directives on, and replaces the canonical by the declared one', () => {
    const elsewhere = 'https://other.example.org/the-original';
    const entry = {
      ...english,
      data: { ...english.data, robots: 'noindex', canonical: elsewhere, updated: '2026-11-15' },
    };
    const computed = metadataOf(english, seoFields, site);
    const result = metadataOf(entry, seoFields, site);

    // Precondition: the declared canonical differs from the computed one.
    expect(computed.canonical).not.toBe(elsewhere);
    expect(result.canonical).toBe(elsewhere);
    expect(result.openGraph.url).toBe(elsewhere);
    expect(result.robots).toBe('noindex');
    expect(result.openGraph.modifiedTime).toBe('2026-11-15');
    // Translations and x-default stay the build's.
    expect(result.alternates).toEqual(computed.alternates);
    expect(result.xDefault).toBe(computed.xDefault);
  });

  it('adds nothing when the entry declares nothing', () => {
    const result = metadataOf(english, seoFields, site);

    expect(result.robots).toBeUndefined();
    expect(result.openGraph.modifiedTime).toBeUndefined();
  });
});

describe('pageMetadataOf', () => {
  it('gives a page without frontmatter (a folder, a term) the metadata of an entry with those fields', () => {
    const page = {
      url: '/en/blog/news',
      locale: 'en',
      alternates: { fr: '/blog/news', en: '/en/blog/news' },
    };
    const metadata = pageMetadataOf(
      { ...page, title: 'News', description: 'What is new', image: '/covers/news.jpeg' },
      site,
    );

    expect(metadata).toEqual(
      metadataOf(
        { ...page, data: { title: 'News', description: 'What is new', image: '/covers/news.jpeg' } },
        { title: 'title', description: 'description', image: 'image' },
        site,
      ),
    );
    // Precondition: the fields made it, so that the comparison means something.
    expect(metadata.title).toBe('News · RTM');
    expect(metadata.openGraph.images).toEqual(['https://example.com/covers/news.jpeg']);
  });

  it('leaves out what it is not given', () => {
    const metadata = pageMetadataOf({ url: '/authors/gustave', locale: 'fr', alternates: {}, title: 'Gustave' }, site);

    expect(metadata.description).toBeUndefined();
    expect(metadata.openGraph.images).toBeUndefined();
  });
});

describe('sitemapOf', () => {
  it('lists every URL with its translations and x-default, sorted, absolute', () => {
    const urls = [
      { url: '/en/docs', locale: 'en', alternates: { fr: '/docs', en: '/en/docs' } },
      { url: '/docs', locale: 'fr', alternates: { fr: '/docs', en: '/en/docs' } },
      { url: '/en/only', locale: 'en', alternates: { en: '/en/only' } },
    ];

    expect(sitemapOf(urls, site)).toEqual([
      {
        url: 'https://example.com/docs',
        alternates: {
          fr: 'https://example.com/docs',
          en: 'https://example.com/en/docs',
          'x-default': 'https://example.com/docs',
        },
      },
      {
        url: 'https://example.com/en/docs',
        alternates: {
          fr: 'https://example.com/docs',
          en: 'https://example.com/en/docs',
          'x-default': 'https://example.com/docs',
        },
      },
      { url: 'https://example.com/en/only', alternates: { en: 'https://example.com/en/only' } },
    ]);
  });
});

describe('sitemapOf: lastmod and noindex', () => {
  it('dates the URLs that carry a date, as W3C dates, and leaves out the ones not indexed', () => {
    const urls = [
      { url: '/a', locale: 'fr', alternates: { fr: '/a' }, modified: '2026-11-12', indexed: true },
      { url: '/b', locale: 'fr', alternates: { fr: '/b' }, modified: '2019-08-14 21:00', indexed: true },
      { url: '/hidden', locale: 'fr', alternates: { fr: '/hidden' }, modified: '2026-11-13', indexed: false },
      { url: '/undated', locale: 'fr', alternates: { fr: '/undated' } },
    ];

    expect(sitemapOf(urls, site).map((item) => [item.url, item.lastModified])).toEqual([
      ['https://example.com/a', '2026-11-12'],
      // A date without a time zone is read as UTC: the same output on every machine.
      ['https://example.com/b', '2019-08-14T21:00:00.000Z'],
      ['https://example.com/undated', undefined],
    ]);
  });
});

describe('catchAllParamsOf', () => {
  it('gives one params object per URL, as path segments, the root as no segment', () => {
    const urls = [{ url: '/' }, { url: '/en' }, { url: '/en/docs/setup' }, { url: '/lp/promo-summer' }];

    expect(catchAllParamsOf(urls, 'url')).toEqual([
      { url: [] },
      { url: ['en'] },
      { url: ['en', 'docs', 'setup'] },
      { url: ['lp', 'promo-summer'] },
    ]);
  });

  it('never repeats a URL', () => {
    expect(catchAllParamsOf([{ url: '/a' }, { url: '/a' }], 'slug')).toEqual([{ slug: ['a'] }]);
  });
});
