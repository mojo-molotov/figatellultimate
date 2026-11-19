import { metadataOf, sitemapOf } from '@figatellultimate/site';
import type { Metadata, MetadataRoute, NextConfig } from 'next';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { toNextMetadata, toNextRedirects, toNextRobots, toNextSitemap } from '../index.js';

const site = { origin: 'https://example.com', name: 'RTM', defaultLocale: 'fr' };
const post = {
  url: '/en/blog/patch-notes/bot/post-02',
  locale: 'en',
  alternates: { fr: '/blog/patch-notes/bot/post-02', en: '/en/blog/patch-notes/bot/post-02' },
  data: { title: 'The bot speaks', date: '2026-11-12', tags: ['release'] },
};

describe('toNextMetadata (Next 16.4)', () => {
  it('maps canonical, languages with x-default, and an article Open Graph', () => {
    const metadata = toNextMetadata(
      metadataOf(post, { title: 'title', publishedTime: 'date', tags: 'tags', type: 'article' }, site),
    );

    expectTypeOf(metadata).toEqualTypeOf<Metadata>();
    expect(metadata).toEqual({
      title: 'The bot speaks',
      alternates: {
        canonical: 'https://example.com/en/blog/patch-notes/bot/post-02',
        languages: {
          fr: 'https://example.com/blog/patch-notes/bot/post-02',
          en: 'https://example.com/en/blog/patch-notes/bot/post-02',
          'x-default': 'https://example.com/blog/patch-notes/bot/post-02',
        },
      },
      openGraph: {
        type: 'article',
        url: 'https://example.com/en/blog/patch-notes/bot/post-02',
        locale: 'en',
        alternateLocale: ['fr'],
        title: 'The bot speaks',
        siteName: 'RTM',
        publishedTime: '2026-11-12',
        tags: ['release'],
      },
    });
  });

  it('keeps a website without x-default when the default locale is missing', () => {
    const englishOnly = { ...post, alternates: { en: post.url } };
    const metadata = toNextMetadata(metadataOf(englishOnly, { title: 'title' }, site));

    expect(metadata.alternates?.languages).toEqual({ en: 'https://example.com/en/blog/patch-notes/bot/post-02' });
    expect(metadata.openGraph).toMatchObject({ type: 'website' });
  });
});

describe('toNextMetadata: SEO overrides', () => {
  it('maps the robots directives and the modification date', () => {
    const data = { ...post.data, robots: 'noindex, nofollow', updated: '2026-11-15' };
    const metadata = toNextMetadata(
      metadataOf(
        { ...post, data },
        { title: 'title', publishedTime: 'date', modifiedTime: 'updated', robots: 'robots', type: 'article' },
        site,
      ),
    );

    expect(metadata.robots).toBe('noindex, nofollow');
    expect(metadata.openGraph).toMatchObject({ modifiedTime: '2026-11-15' });
    // Nothing declared, nothing set: Next keeps its default.
    expect(toNextMetadata(metadataOf(post, { title: 'title' }, site)).robots).toBeUndefined();
  });
});

describe('toNextRobots', () => {
  it('allows everything and points at the sitemap, absolute', () => {
    const robots = toNextRobots(site);

    expectTypeOf(robots).toEqualTypeOf<MetadataRoute.Robots>();
    expect(robots).toEqual({ rules: [{ userAgent: '*', allow: '/' }], sitemap: 'https://example.com/sitemap.xml' });
  });

  it('takes another sitemap path and disallowed paths', () => {
    expect(toNextRobots(site, { sitemap: '/maps/site.xml', disallow: ['/drafts'] })).toEqual({
      rules: [{ userAgent: '*', allow: '/', disallow: ['/drafts'] }],
      sitemap: 'https://example.com/maps/site.xml',
    });
  });
});

describe('toNextSitemap', () => {
  it('maps the modification date', () => {
    const [entry] = toNextSitemap(
      sitemapOf([{ url: '/a', locale: 'fr', alternates: { fr: '/a' }, modified: '2026-11-12' }], site),
    );

    expect(entry?.lastModified).toBe('2026-11-12');
  });

  it('maps every URL with its translations', () => {
    const sitemap = toNextSitemap(sitemapOf([post], site));

    expectTypeOf(sitemap).toEqualTypeOf<MetadataRoute.Sitemap>();
    expect(sitemap).toEqual([
      {
        url: 'https://example.com/en/blog/patch-notes/bot/post-02',
        alternates: {
          languages: {
            fr: 'https://example.com/blog/patch-notes/bot/post-02',
            en: 'https://example.com/en/blog/patch-notes/bot/post-02',
            'x-default': 'https://example.com/blog/patch-notes/bot/post-02',
          },
        },
      },
    ]);
  });
});

describe('toNextRedirects', () => {
  it('maps a redirect table to permanent Next redirects', () => {
    const redirects = toNextRedirects([
      { from: '/en/about', to: '/about' },
      { from: '/docs/setup', to: '/fr/docs/setup' },
    ]);

    expect(redirects).toEqual([
      { source: '/en/about', destination: '/about', permanent: true },
      { source: '/docs/setup', destination: '/fr/docs/setup', permanent: true },
    ]);
    expectTypeOf(redirects).toExtend<Awaited<ReturnType<NonNullable<NextConfig['redirects']>>>>();
  });

  it("escapes Next's pattern syntax, so a URL only matches itself", () => {
    expect(toNextRedirects([{ from: '/a:b/(c)*', to: '/x' }])[0]?.source).toBe('/a\\:b/\\(c\\)\\*');
  });
});
