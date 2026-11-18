import { describe, expect, it } from 'vitest';

import { analyze, hasErrors, type SourceInput } from '../analyze.js';
import { defineCollection, type Collection } from '../../declarations/collection.js';
import { segment, slug } from '../../declarations/grammar.js';
import { blog, landingPages, locales, pages } from '../../__tests__/scenarios/collections.js';
import { defineLocales } from '../../declarations/locales.js';
import { createUrlBuilder, type UrlBuilder, type UrlOptions } from '../url.js';

/** The three scenario collections, `pages` reserving `lp/sign-up`. */
const reservingSignUp: Readonly<Record<string, Collection>> = { pages, blog, landingPages };
/** Same, without the reservation: focused tests then only see the diagnostics they are about. */
const focused: Readonly<Record<string, Collection>> = {
  ...reservingSignUp,
  pages: defineCollection({ ...pages, reserved: [] }),
};

const src = (collection: string, ...paths: string[]): SourceInput[] =>
  paths.map((sourcePath) => ({ collection, sourcePath }));

const run = (sources: readonly SourceInput[], urls?: UrlBuilder, collections = focused) =>
  analyze({ locales, collections, sources, urls });
const runReserving = (sources: readonly SourceInput[], urls?: UrlBuilder) => run(sources, urls, reservingSignUp);

/** A valid content tree of demo content. */
const demoContent: SourceInput[] = [
  ...src('pages', 'index.mdx', 'en/index.mdx', 'lp/sign-up.mdx', 'en/lp/sign-up.mdx'),
  ...src('pages', 'nesting-1/page-00.mdx', 'nesting-1/nesting-2/page-00.mdx', 'en/nesting-1/nesting-2/page-00.mdx'),
  ...src('pages', 'testing-pages-root/fake-nesting/index.mdx'),
  ...src('blog', 'patch-notes/dashboard/post-01.mdx', 'patch-notes/dashboard/en/post-01.mdx'),
  ...src('blog', 'patch-notes/dashboard/post-02.mdx', 'patch-notes/discord-bot/post-01.mdx'),
  ...src('landingPages', 'dummy-category/lp-00.mdx', 'dummy-category/en/lp-00.mdx', 'dummy-category/index.mdx'),
];

const codesOf = (sources: readonly SourceInput[], urls?: UrlBuilder) =>
  run(sources, urls).diagnostics.map((d) => [d.collection, d.sourcePath, d.code]);

describe('analyze', () => {
  it('accepts the demo content without any diagnostic', () => {
    const analysis = runReserving(demoContent);

    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.entries).toHaveLength(demoContent.length);
    expect(hasErrors(analysis)).toBe(false);
  });

  it('landing pages whose concatenated routes collide produce url-collision', () => {
    const analysis = run(src('landingPages', 'a-b/c.mdx', 'a/b-c.mdx'));

    expect(analysis.diagnostics.map((d) => [d.sourcePath, d.code, d.data])).toEqual([
      [
        'a-b/c.mdx',
        'url-collision',
        { url: '/lp/a-b-c', others: [{ collection: 'landingPages', sourcePath: 'a/b-c.mdx' }] },
      ],
      [
        'a/b-c.mdx',
        'url-collision',
        { url: '/lp/a-b-c', others: [{ collection: 'landingPages', sourcePath: 'a-b/c.mdx' }] },
      ],
    ]);
    expect(analysis.entries).toEqual([]);
  });

  it('detects URL collisions across collections', () => {
    expect(codesOf([...src('pages', 'blog/x/y/z.mdx'), ...src('blog', 'x/y/z.mdx')])).toEqual([
      ['blog', 'x/y/z.mdx', 'url-collision'],
      ['pages', 'blog/x/y/z.mdx', 'url-collision'],
    ]);
  });

  it('an implicit and an explicit default-locale version of the same entry are an error', () => {
    const analysis = run(src('pages', 'x.mdx', 'fr/x.mdx'));

    expect(analysis.diagnostics.map((d) => [d.sourcePath, d.code])).toEqual([
      ['fr/x.mdx', 'duplicate-default-locale'],
      ['x.mdx', 'duplicate-default-locale'],
    ]);
    expect(analysis.entries).toEqual([]);
  });

  it('reports `foo.mdx` and `foo/index.mdx` as a key collision (and not as an ugly index)', () => {
    expect(codesOf(src('pages', 'foo.mdx', 'foo/index.mdx'))).toEqual([
      ['pages', 'foo.mdx', 'key-collision'],
      ['pages', 'foo/index.mdx', 'key-collision'],
    ]);
  });

  it('reports case-only collisions, for case-insensitive file systems', () => {
    expect(codesOf(src('pages', 'Foo.mdx', 'foo.mdx'))).toEqual([
      ['pages', 'Foo.mdx', 'case-collision'],
      ['pages', 'Foo.mdx', 'invalid-name'],
      ['pages', 'foo.mdx', 'case-collision'],
    ]);
  });

  it('warns about an ugly index and keeps the entry', () => {
    const analysis = run(src('pages', 'foo.mdx', 'foo/bar.mdx'));

    expect(analysis.diagnostics).toEqual([
      expect.objectContaining({ code: 'ugly-index', sourcePath: 'foo.mdx', suggestions: ['foo/index.mdx'] }),
    ]);
    expect(analysis.entries).toHaveLength(2);
    expect(hasErrors(analysis)).toBe(false);
  });

  it('warns about a reservation that matches nothing, with suggestions', () => {
    const analysis = runReserving(src('pages', 'lp/sign-in.mdx'));

    expect(analysis.diagnostics).toEqual([
      expect.objectContaining({
        code: 'unused-reservation',
        severity: 'warning',
        collection: 'pages',
        sourcePath: null,
        data: { pattern: 'lp/sign-up' },
        suggestions: ['lp/sign-in'],
      }),
    ]);
  });

  it('never loses successes: valid entries are kept when other sources fail', () => {
    const analysis = runReserving([...demoContent, ...src('blog', 'patch-notes/index.mdx', 'x/y/drafts/z.mdx')]);

    expect(analysis.entries).toHaveLength(demoContent.length);
    expect(analysis.diagnostics.map((d) => d.code)).toEqual(['index-forbidden', 'unknown-locale']);
    expect(hasErrors(analysis)).toBe(true);
  });

  it('is deterministic: the output does not depend on the input order', () => {
    const inputs = [...demoContent, ...src('pages', 'foo.mdx', 'foo/bar.mdx', 'Foo.mdx'), ...src('blog', 'a/b.mdx')];
    const reversed = [...inputs].reverse();
    const rotated = [...inputs.slice(5), ...inputs.slice(0, 5)];

    // Precondition: the permutations really differ from the original order.
    expect(reversed).not.toEqual(inputs);
    expect(rotated).not.toEqual(inputs);
    expect(runReserving(reversed)).toEqual(runReserving(inputs));
    expect(runReserving(rotated)).toEqual(runReserving(inputs));
  });

  it('detects URL collisions according to the URL strategy', () => {
    // A collection without locale part: `en/x.mdx` is the default-locale (fr) route `/en/x`.
    const docs = defineCollection({ entry: 'doc', base: '', grammar: [segment('section'), slug()] });
    const sources = [...src('docs', 'en/x.mdx'), ...src('pages', 'en/x.mdx')];
    const codes = (urls: UrlBuilder) =>
      analyze({ locales, collections: { ...focused, docs }, sources, urls }).diagnostics.map((d) => d.code);

    // Implicit default locale: fr `/en/x` and en `/x` both give `/en/x`.
    expect(codes(createUrlBuilder(locales))).toEqual(['url-collision', 'url-collision']);
    // Explicit default locale: `/fr/en/x` and `/en/x` no longer collide.
    expect(codes(createUrlBuilder(locales, { defaultLocale: 'explicit' }))).toEqual([]);
  });

  it('throws when the URL builder was created with other locales (broken caller contract)', () => {
    const other = createUrlBuilder(defineLocales({ list: ['en'], default: 'en' }));

    expect(() => run(src('pages', 'x.mdx'), other)).toThrow(TypeError);
  });

  it('ignores non-.mdx paths silently and throws on an unknown collection (broken caller contract)', () => {
    expect(run(src('pages', 'image.png', 'notes.md'))).toEqual({ entries: [], diagnostics: [] });
    expect(() => run(src('nope', 'x.mdx'))).toThrow(TypeError);
  });

  it('returns frozen data', () => {
    const analysis = runReserving([...demoContent, ...src('pages', 'foo.mdx', 'foo/bar.mdx')]);

    expect(Object.isFrozen(analysis)).toBe(true);
    expect(Object.isFrozen(analysis.entries)).toBe(true);
    expect(Object.isFrozen(analysis.diagnostics)).toBe(true);
    expect(analysis.diagnostics.every((d) => Object.isFrozen(d))).toBe(true);
  });

  it.each([{}, { defaultLocale: 'explicit' }, { trailingSlash: true }] as const)(
    'round trip path → descriptor → URL → descriptor, for %j',
    (options: UrlOptions) => {
      const urls = createUrlBuilder(locales, options);
      const { entries } = runReserving(demoContent, urls);
      const byUrl = new Map(entries.map((entry) => [urls.url(entry), entry]));

      // URLs are unique, so the URL index resolves every entry back to itself.
      expect(byUrl.size).toBe(entries.length);

      for (const entry of entries) expect(byUrl.get(urls.url(entry))).toBe(entry);

      // Generator guarantee: some entries are not in the default locale and some routes differ from their path.
      expect(entries.some((entry) => entry.locale !== locales.default)).toBe(true);
      expect(entries.some((entry) => entry.route !== `/${entry.sourcePath.replace(/\.mdx$/, '')}`)).toBe(true);
    },
  );
});
