/**
 * RSS 2.0 feeds, one per collection and locale, from the entries the app loads.
 *
 * Key design decisions:
 *     - RSS 2.0, the most widely read format; the description of each entry, not its full content, its French
 *       spacing kept: a feed reader shows it to a reader, as the page's previews (`feed.test.ts`).
 *     - Deterministic: no clock, a stable order; a build always writes the same feed for the same content.
 *     - A `noindex` entry is left out, as from the sitemap and the search.
 *
 * Invariants: order, limit, escaping, `noindex` and determinism (`feed.test.ts`).
 */
import { absoluteOn, forbidsIndexing, parseDate, text, texts } from './shared.js';
import type { MetadataFields, Site, SiteEntryWithData } from './types.js';

/** A feed's own description: its title, description, page and locale, and where the feed itself is served. */
export interface FeedChannel {
  readonly title: string;
  readonly description: string;
  /** The page the feed follows, e.g. the blog's (`'/blog'`). */
  readonly url: string;
  /** The feed's own URL (`'/feed.xml'`), for its `atom:link rel="self"`. */
  readonly feed?: string | undefined;
  readonly locale: string;
}

/** What a feed is made of. */
export interface FeedInput {
  readonly channel: FeedChannel;
  /** The entries, loaded (their frontmatter), in any order. */
  readonly entries: readonly SiteEntryWithData[];
  /** Their collection's declared fields: title, description, publication date, tags, robots. */
  readonly fields: MetadataFields;
  readonly site: Site;
  /** Each entry's categories, e.g. its tags' translated labels; default: the declared `tags` field as it is. */
  readonly categories?: ((entry: SiteEntryWithData) => readonly string[]) | undefined;
  /** Each entry's authors' names, translated by the app. */
  readonly authors?: ((entry: SiteEntryWithData) => readonly string[]) | undefined;
  /** How many of the newest entries. Default: 20. */
  readonly limit?: number | undefined;
}

const escape = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const element = (name: string, value: string | undefined): string[] =>
  value === undefined ? [] : [`<${name}>${escape(value)}</${name}>`];

/**
 * An RSS 2.0 feed of a collection in one locale.
 *
 * @param input - The channel, the loaded entries in any order, their collection's fields, the site, and optionally
 *   their categories and authors (translated by the app) and how many to keep.
 * @returns The feed's XML: the entries whose robots allow indexing, newest first by publication date (ties in URL
 *   order), up to `limit` (20); absolute links, RFC 822 dates, categories, authors as `dc:creator`, every text
 *   escaped; `lastBuildDate` is the newest entry's date, never the clock, so the same entries give the same feed.
 *
 * @example
 * const xml = rssOf({ channel, entries: posts, fields: metadataFields.blog, site, authors, categories });
 * return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
 */
export function rssOf(input: FeedInput): string {
  const { channel, fields, site } = input;
  const absolute = absoluteOn(site);
  const read = (entry: SiteEntryWithData, field: string | undefined): unknown =>
    field === undefined ? undefined : entry.data[field];
  const dated = input.entries
    .filter((entry) => !forbidsIndexing(text(read(entry, fields.robots))))
    .map((entry) => {
      const value = text(read(entry, fields.publishedTime));

      return { entry, date: value === undefined ? undefined : parseDate(value) };
    })
    .sort(
      (a, b) =>
        (b.date?.getTime() ?? -Infinity) - (a.date?.getTime() ?? -Infinity) ||
        (a.entry.url < b.entry.url ? -1 : a.entry.url > b.entry.url ? 1 : 0),
    )
    .slice(0, input.limit ?? 20);
  const items = dated.map(({ entry, date }) => {
    const link = absolute(entry.url);

    return [
      '<item>',
      ...element('title', text(read(entry, fields.title))),
      ...element('link', link),
      `<guid isPermaLink="true">${escape(link)}</guid>`,
      ...element('description', text(read(entry, fields.description))),
      ...element('pubDate', date?.toUTCString()),
      ...(input.authors?.(entry) ?? []).flatMap((name) => element('dc:creator', name)),
      ...(input.categories?.(entry) ?? texts(read(entry, fields.tags)) ?? []).flatMap((tag) =>
        element('category', tag),
      ),
      '</item>',
    ].join('');
  });
  const newest = dated[0]?.date;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '<channel>',
    ...element('title', channel.title),
    ...element('link', absolute(channel.url)),
    ...element('description', channel.description),
    ...element('language', channel.locale),
    ...(channel.feed === undefined
      ? []
      : [`<atom:link href="${escape(absolute(channel.feed))}" rel="self" type="application/rss+xml"/>`]),
    ...element('lastBuildDate', newest?.toUTCString()),
    ...items,
    '</channel>',
    '</rss>',
    '',
  ].join('\n');
}
