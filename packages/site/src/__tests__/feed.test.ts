import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { rssOf } from '../index.js';
import type { MetadataFields, Site, SiteEntryWithData } from '../types.js';

const site: Site = { origin: 'https://example.com', name: 'figatellultimate', defaultLocale: 'fr' };
const fields: MetadataFields = {
  title: 'title',
  description: 'description',
  publishedTime: 'date',
  tags: 'tags',
  robots: 'robots',
};
const entry = (slug: string, data: Record<string, unknown>): SiteEntryWithData => ({
  url: `/blog/news/${slug}`,
  locale: 'fr',
  alternates: { fr: `/blog/news/${slug}` },
  data: { title: slug, description: `About ${slug}`, ...data },
});
const channel = { title: 'Blog', description: 'Les nouvelles', url: '/blog', feed: '/feed.xml', locale: 'fr' };

/** The values of a tag, in document order. */
const values = (xml: string, tag: string): string[] =>
  [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))].map((match) => match[1] ?? '');

describe('rssOf', () => {
  const entries = [
    entry('old', { date: '2026-01-01' }),
    entry('new', { date: '2026-03-01', tags: ['release'] }),
    entry('hidden', { date: '2026-04-01', robots: 'noindex' }),
    entry('middle', { date: '2026-02-01' }),
  ];

  it('lists the indexed entries newest first, with absolute links, dates and categories', () => {
    const xml = rssOf({ channel, entries, fields, site, authors: () => ['Gustave'] });

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"')).toBe(true);
    // The channel's own title first, then each item's.
    expect(values(xml, 'title')).toEqual(['Blog', 'new', 'middle', 'old']);
    expect(values(xml, 'link')).toEqual([
      'https://example.com/blog',
      'https://example.com/blog/news/new',
      'https://example.com/blog/news/middle',
      'https://example.com/blog/news/old',
    ]);
    expect(values(xml, 'pubDate')[0]).toBe('Sun, 01 Mar 2026 00:00:00 GMT');
    expect(values(xml, 'lastBuildDate')).toEqual(['Sun, 01 Mar 2026 00:00:00 GMT']);
    expect(values(xml, 'category')).toEqual(['release']);
    expect(values(xml, 'dc:creator')).toEqual(['Gustave', 'Gustave', 'Gustave']);
    expect(values(xml, 'language')).toEqual(['fr']);
    expect(xml).toContain('<atom:link href="https://example.com/feed.xml" rel="self" type="application/rss+xml"/>');
    expect(xml).not.toContain('hidden');
  });

  it('takes categories from the app, e.g. translated tag labels', () => {
    const xml = rssOf({
      channel,
      entries,
      fields,
      site,
      categories: (item) => (item.url.endsWith('/new') ? ['Version'] : []),
    });

    expect(values(xml, 'category')).toEqual(['Version']);
  });

  it('keeps the newest ones up to its limit', () => {
    expect(values(rssOf({ channel, entries, fields, site, limit: 1 }), 'title')).toEqual(['Blog', 'new']);
  });

  it('escapes every text, so that any title gives a well-formed feed', () => {
    const tricky = 'Q&A <bot> "quotes" ]]> \'s';
    const xml = rssOf({
      channel: { ...channel, title: tricky },
      entries: [entry('a', { title: tricky, date: '2026-01-01' })],
      fields,
      site,
    });

    expect(xml).not.toContain(tricky);
    expect(values(xml, 'title')).toEqual([
      'Q&amp;A &lt;bot&gt; &quot;quotes&quot; ]]&gt; &apos;s',
      'Q&amp;A &lt;bot&gt; &quot;quotes&quot; ]]&gt; &apos;s',
    ]);
  });

  it('keeps only the characters XML 1.0 allows, so that a pasted control character never breaks the feed', () => {
    // A character outside XML 1.0's `Char`: a C0 control but tab, newline and carriage return, a lone surrogate, U+FFFE
    // or U+FFFF. Pasted from a PDF or a word processor, one made the whole feed invalid for its readers.
    const forbidden =
      // eslint-disable-next-line no-control-regex -- the control characters XML forbids are what it looks for.
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;

    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (text) => {
        const xml = rssOf({
          channel: { ...channel, description: text },
          entries: [entry('a', { title: text, description: text, date: '2026-01-01' })],
          fields,
          site,
        });

        expect(forbidden.test(xml)).toBe(false);
      }),
      { examples: [['Avant\u0008après'], ['\u000B\u000C\u001F\uFFFE\uFFFF'], ['moitié \uD83D seule']] },
    );
    // The allowed ones stay: tab, newline, an emoji's surrogate pair.
    expect(
      values(
        rssOf({ channel, entries: [entry('a', { title: 'a\tb\nc 🎉', date: '2026-01-01' })], fields, site }),
        'title',
      ),
    ).toContain('a\tb\nc 🎉');
  });

  it('is the same for the same entries, whatever their order', () => {
    expect(rssOf({ channel, entries: [...entries].reverse(), fields, site })).toBe(
      rssOf({ channel, entries, fields, site }),
    );
  });

  it("keeps the French spacing of each description: a feed reader shows it to a reader, as the page's previews", () => {
    const typeset = 'Tout sur Sartinu\u00a0: son habitat\u202f!';
    const xml = rssOf({
      entries: [entry('typeset', { date: '2026-01-01', description: typeset })],
      fields,
      site,
      channel,
    });

    expect(values(xml, 'description')).toContain(typeset);
  });
});
