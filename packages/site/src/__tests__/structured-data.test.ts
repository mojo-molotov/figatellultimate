import { describe, expect, it } from 'vitest';

import { breadcrumbListOf, jsonLd, personOf, structuredDataOf } from '../index.js';
import type { MetadataFields, Site, SiteEntryWithData } from '../types.js';

const site: Site = { origin: 'https://example.com', name: 'figatellu', defaultLocale: 'fr' };
const fields: MetadataFields = {
  title: 'title',
  description: 'description',
  image: 'cover',
  publishedTime: 'date',
  modifiedTime: 'updated',
  canonical: 'canonical',
  schema: 'BlogPosting',
};
const post: SiteEntryWithData = {
  url: '/en/blog/news/launch',
  locale: 'en',
  alternates: { fr: '/blog/news/launch', en: '/en/blog/news/launch' },
  data: {
    title: 'Launch',
    description: 'It is out',
    cover: '/covers/launch.jpeg',
    date: '2026-11-01',
    updated: '2026-11-15',
  },
};

describe('structuredDataOf', () => {
  it("describes an entry with its collection's schema.org type, absolute URLs and its authors", () => {
    expect(
      structuredDataOf(post, fields, site, {
        authors: [{ name: 'Gustave', url: '/en/authors/gustave' }, { name: 'Arnaud' }],
      }),
    ).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: 'Launch',
      description: 'It is out',
      image: ['https://example.com/covers/launch.jpeg'],
      datePublished: '2026-11-01',
      dateModified: '2026-11-15',
      author: [
        { '@type': 'Person', name: 'Gustave', url: 'https://example.com/en/authors/gustave' },
        { '@type': 'Person', name: 'Arnaud' },
      ],
      url: 'https://example.com/en/blog/news/launch',
      mainEntityOfPage: 'https://example.com/en/blog/news/launch',
      inLanguage: 'en',
      publisher: { '@type': 'Organization', name: 'figatellu' },
    });
  });

  it('is a WebPage with a name by default, and leaves out what the entry does not give', () => {
    const page: SiteEntryWithData = {
      url: '/about',
      locale: 'fr',
      alternates: { fr: '/about' },
      data: { title: 'À propos' },
    };

    expect(structuredDataOf(page, { title: 'title' }, { origin: 'https://example.com', defaultLocale: 'fr' })).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'À propos',
      url: 'https://example.com/about',
      inLanguage: 'fr',
    });
  });

  it('dates the modification by the publication when nothing else is declared, and keeps a declared canonical', () => {
    const canonical = 'https://elsewhere.example.org/launch';
    const data = Object.fromEntries([
      ...Object.entries(post.data).filter(([key]) => key !== 'updated'),
      ['canonical', canonical],
    ]);
    const result = structuredDataOf({ ...post, data }, fields, site);

    expect(result['dateModified']).toBe('2026-11-01');
    expect(result['url']).toBe(canonical);
  });

  it('is frozen and leaves the entry untouched', () => {
    const copy: unknown = JSON.parse(JSON.stringify(post));
    const result = structuredDataOf(post, fields, site);

    expect(Object.isFrozen(result)).toBe(true);
    expect(post).toEqual(copy);
  });
});

describe('breadcrumbListOf', () => {
  it('numbers the steps, with absolute links; a step without a page has none', () => {
    expect(
      breadcrumbListOf(
        [{ label: 'Accueil', url: '/' }, { label: 'Blog', url: '/blog' }, { label: 'Section' }, { label: 'Lancement' }],
        site,
      ),
    ).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Accueil', item: 'https://example.com/' },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://example.com/blog' },
        { '@type': 'ListItem', position: 3, name: 'Section' },
        { '@type': 'ListItem', position: 4, name: 'Lancement' },
      ],
    });
  });
});

describe('personOf', () => {
  it('describes a term page as a person', () => {
    expect(
      personOf(
        {
          name: 'Gustave',
          url: '/authors/gustave',
          image: '/authors/gustave.svg',
          description: 'Writes the core',
          sameAs: ['https://github.com/gustave'],
        },
        site,
      ),
    ).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: 'Gustave',
      url: 'https://example.com/authors/gustave',
      image: 'https://example.com/authors/gustave.svg',
      description: 'Writes the core',
      sameAs: ['https://github.com/gustave'],
    });
  });
});

describe('jsonLd', () => {
  it('can never close its script, and parses back to the same data', () => {
    const data = personOf({ name: '</script><script>alert(1)</script>', url: '/a' }, site);
    const json = jsonLd([data]);

    expect(json).not.toContain('<');
    expect(JSON.parse(json)).toEqual([data]);
  });
});
