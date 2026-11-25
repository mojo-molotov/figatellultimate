import { describe, expect, it } from 'vitest';

import { blog, landingPages, locales, pages } from '../../__tests__/scenarios/collections.js';
import type { Collection } from '../../declarations/collection.js';
import { defineLocales, type Locales } from '../../declarations/locales.js';
import { analyze, hasErrors, type SourceInput } from '../analyze.js';
import type { EntryDescriptor } from '../descriptor.js';
import { entryPathOf, planMigration, type MigrationPlan, type MigrationTarget } from '../migration.js';
import { parseEntryPath } from '../parse.js';
import { createUrlBuilder, type UrlOptions } from '../url.js';

const collections: Readonly<Record<string, Collection>> = { pages, blog, landingPages };

const src = (collection: string, ...paths: string[]): SourceInput[] =>
  paths.map((sourcePath) => ({ collection, sourcePath }));

/** Sample content in the implicit notation, French by default: translations, depths, index files, a reservation. */
const CONTENT: readonly SourceInput[] = [
  ...src('pages', 'index.mdx', 'en/index.mdx', 'about.mdx', 'en/about.mdx', 'lp/sign-up.mdx', 'en/lp/sign-up.mdx'),
  ...src('pages', 'nesting-1/nesting-2/page-00.mdx', 'en/nesting-1/nesting-2/page-00.mdx', 'docs/index.mdx'),
  ...src('blog', 'patch-notes/dashboard/post-01.mdx', 'patch-notes/dashboard/en/post-01.mdx'),
  ...src('blog', 'patch-notes/discord-bot/en/post-02.mdx'),
  ...src('landingPages', 'dummy-category/lp-00.mdx', 'dummy-category/en/lp-00.mdx', 'dummy-category/index.mdx'),
];

function entriesOf(sources: readonly SourceInput[], declared: Locales, urls: UrlOptions = {}): EntryDescriptor[] {
  const analysis = analyze({ locales: declared, collections, sources, urls: createUrlBuilder(declared, urls) });

  // Precondition: the scenario is valid, so the plan is the only thing under test.
  expect(analysis.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

  return [...analysis.entries];
}

function plan(
  sources: readonly SourceInput[],
  target: MigrationTarget,
  declared: Locales = locales,
  urls: UrlOptions = {},
) {
  return planMigration({ locales: declared, collections, urls, entries: entriesOf(sources, declared, urls), target });
}

function value(result: ReturnType<typeof plan>): MigrationPlan {
  if (!result.ok) throw new Error(`plan failed: ${JSON.stringify(result.errors)}`);

  return result.value;
}

/** The tree after a plan: each source moved to its target. */
const applied = (sources: readonly SourceInput[], migration: MigrationPlan): SourceInput[] =>
  sources.map((s) => ({
    collection: s.collection,
    sourcePath:
      migration.moves.find((m) => m.collection === s.collection && m.from === s.sourcePath)?.to ?? s.sourcePath,
  }));

const sorted = (sources: readonly SourceInput[]): string[] =>
  sources.map((s) => `${s.collection}:${s.sourcePath}`).sort();

const declarations: readonly Locales[] = [
  locales,
  defineLocales({ list: ['fr', 'en'], default: 'en' }),
  defineLocales({ list: ['fr', 'en'], default: 'fr', notation: 'explicit' }),
  defineLocales({ list: ['fr', 'en', 'de'], default: 'de', notation: 'explicit' }),
];

describe('entryPathOf, the inverse of parseEntryPath', () => {
  it('gives back the source path of every entry', () => {
    for (const entry of entriesOf(CONTENT, locales)) {
      const collection = collections[entry.collection];

      if (collection === undefined) throw new Error(entry.collection);

      expect(entryPathOf(collection, locales, entry)).toBe(entry.sourcePath);
    }
  });

  it('keeps a file its own extension: a `.md` file stays one', () => {
    const [entry] = analyze({
      locales,
      collections,
      sources: [{ collection: 'pages', sourcePath: 'en/guide/setup.md' }],
      extensions: ['.mdx', '.md'],
    }).entries;
    const collection = collections['pages'];

    // Precondition: the entry is read.
    expect(entry?.sourcePath).toBe('en/guide/setup.md');

    if (entry === undefined || collection === undefined) return;

    expect(entryPathOf(collection, locales, entry)).toBe('en/guide/setup.md');
  });

  it('round trips under every declaration: the path it gives parses back to the same entry', () => {
    const entries = entriesOf(CONTENT, locales);
    let changed = 0;

    for (const declared of declarations) {
      for (const entry of entries) {
        const collection = collections[entry.collection];

        if (collection === undefined) throw new Error(entry.collection);

        const path = entryPathOf(collection, declared, entry);

        if (path !== entry.sourcePath) changed += 1;

        const parsed = parseEntryPath(entry.collection, collection, declared, path);

        if (!parsed.ok) throw new Error(`${path}: ${JSON.stringify(parsed.errors)}`);

        expect({ ...parsed.value, sourcePath: entry.sourcePath, localeSource: entry.localeSource }).toEqual(entry);
      }
    }

    // Precondition: the declarations do move files (a no-op would pass otherwise).
    expect(changed).toBeGreaterThan(10);
  });

  it('places the locale folder where the grammar says, the default one omitted in the implicit notation only', () => {
    const entry = { locale: 'fr', segments: { category: 'patch-notes', subcategory: 'bot' }, slug: 'post-01' };

    expect(entryPathOf(blog, locales, entry)).toBe('patch-notes/bot/post-01.mdx');
    expect(entryPathOf(blog, declarations[2] ?? locales, entry)).toBe('patch-notes/bot/fr/post-01.mdx');
    expect(entryPathOf(blog, locales, { ...entry, locale: 'en' })).toBe('patch-notes/bot/en/post-01.mdx');
    expect(entryPathOf(pages, locales, { locale: 'en', segments: { path: '' }, slug: 'index' })).toBe('en/index.mdx');
    expect(entryPathOf(pages, locales, { locale: 'fr', segments: { path: 'a/b' }, slug: 'c' })).toBe('a/b/c.mdx');
  });
});

describe('planMigration: the default locale', () => {
  it('moves the old default into its folder and the new default out of it', () => {
    const migration = value(plan(CONTENT, { kind: 'default-locale', locale: 'en' }));

    expect(migration.locales.default).toBe('en');
    expect(migration.moves).toContainEqual({ collection: 'pages', from: 'about.mdx', to: 'fr/about.mdx' });
    expect(migration.moves).toContainEqual({ collection: 'pages', from: 'en/about.mdx', to: 'about.mdx' });
    expect(migration.moves).toContainEqual({
      collection: 'blog',
      from: 'patch-notes/discord-bot/en/post-02.mdx',
      to: 'patch-notes/discord-bot/post-02.mdx',
    });
    // Every entry moves here: each one is either French (now explicit) or English (now implicit).
    expect(migration.moves).toHaveLength(CONTENT.length);
  });

  it('is an involution: French → English → French gives the original tree (no implicit and explicit twin ever appears)', () => {
    const there = value(plan(CONTENT, { kind: 'default-locale', locale: 'en' }));
    const migrated = applied(CONTENT, there);
    const back = value(plan(migrated, { kind: 'default-locale', locale: 'fr' }, there.locales));

    expect(sorted(applied(migrated, back))).toEqual(sorted(CONTENT));
  });

  it('redirects every mounted URL that changed, except an old URL another entry now uses', () => {
    const migration = value(plan(CONTENT, { kind: 'default-locale', locale: 'en' }));

    expect(migration.redirects).toContainEqual({ from: '/en/about', to: '/about' });
    // A page that exists in French only keeps no URL of its own: it moves under /fr.
    expect(migration.redirects).toContainEqual({ from: '/docs', to: '/fr/docs' });
    // A translated post: its English version takes the unprefixed URL.
    expect(migration.reused).toContain('/blog/patch-notes/dashboard/post-01');
    // `/about` now serves the English page: redirecting it to `/fr/about` would hide that page.
    expect(migration.reused).toContain('/about');
    expect(migration.redirects.map((r) => r.from)).not.toContain('/about');
    // A redirect never starts from a URL in use after the migration.
    const used = new Set(migration.redirects.map((r) => r.to));

    for (const redirect of migration.redirects) expect(migration.reused).not.toContain(redirect.from);

    expect(used.size).toBe(migration.redirects.length);
  });

  it('never redirects a reserved entry, served by its dedicated route', () => {
    const migration = value(plan(CONTENT, { kind: 'default-locale', locale: 'en' }));

    expect(migration.redirects.some((r) => r.from.includes('sign-up') || r.to.includes('sign-up'))).toBe(false);
  });

  it('has no redirect when every locale is prefixed (urls.defaultLocale explicit)', () => {
    const urls: UrlOptions = { defaultLocale: 'explicit' };
    const migration = value(plan(CONTENT, { kind: 'default-locale', locale: 'en' }, locales, urls));

    expect(migration.moves.length).toBeGreaterThan(0);
    expect(migration.redirects).toEqual([]);
  });

  it('fails with the new tree’s diagnostics when the result would collide', () => {
    // `en/fr.mdx` is the English page `/en/fr`; once English is the default, it is `/fr`: the French home's URL.
    const result = plan([...CONTENT, ...src('pages', 'en/fr.mdx')], { kind: 'default-locale', locale: 'en' });

    expect(result.ok).toBe(false);

    if (result.ok) return;

    const [error] = result.errors;

    expect(error.code).toBe('migration-conflict');
    expect(error.code === 'migration-conflict' && error.data.diagnostics.map((d) => d.code)).toContain('url-collision');
  });

  it('rejects an undeclared locale, with a suggestion', () => {
    const result = plan(CONTENT, { kind: 'default-locale', locale: 'em' });

    expect(result).toMatchObject({
      ok: false,
      errors: [{ code: 'migration-unknown-locale', data: { locale: 'em' }, suggestions: ['en'] }],
    });
  });

  it('warns when nothing changes, and moves nothing', () => {
    const result = plan(CONTENT, { kind: 'default-locale', locale: 'fr' });

    expect(result).toMatchObject({
      ok: true,
      value: { moves: [], redirects: [] },
      warnings: [{ code: 'migration-no-change' }],
    });
  });
});

describe('planMigration: the notation', () => {
  it('implicit → explicit puts the default locale in its folder, and changes no URL', () => {
    const migration = value(plan(CONTENT, { kind: 'notation', notation: 'explicit' }));

    expect(migration.locales.notation).toBe('explicit');
    expect(migration.moves).toContainEqual({ collection: 'pages', from: 'index.mdx', to: 'fr/index.mdx' });
    expect(migration.moves).toContainEqual({
      collection: 'landingPages',
      from: 'dummy-category/index.mdx',
      to: 'dummy-category/fr/index.mdx',
    });
    // English entries already have their folder.
    expect(migration.moves.some((m) => m.from.includes('/en/') || m.from.startsWith('en/'))).toBe(false);
    expect(migration.redirects).toEqual([]);
    expect(hasErrors(analyze({ locales: migration.locales, collections, sources: applied(CONTENT, migration) }))).toBe(
      false,
    );
  });

  it('is an involution: implicit → explicit → implicit gives the original tree', () => {
    const there = value(plan(CONTENT, { kind: 'notation', notation: 'explicit' }));
    const migrated = applied(CONTENT, there);
    const back = value(plan(migrated, { kind: 'notation', notation: 'implicit' }, there.locales));

    expect(sorted(applied(migrated, back))).toEqual(sorted(CONTENT));
  });
});

describe('planMigration: redirect tables compose across migrations', () => {
  it('without a previous table, the table is the migration’s own redirects', () => {
    const migration = value(plan(CONTENT, { kind: 'default-locale', locale: 'en' }));

    expect(migration.table).toEqual(migration.redirects);
  });

  it('there and back: the loops vanish, links to the temporary URLs lead home, in one hop', () => {
    const there = value(plan(CONTENT, { kind: 'default-locale', locale: 'en' }));
    const migrated = applied(CONTENT, there);
    const back = value(
      planMigration({
        locales: there.locales,
        collections,
        entries: entriesOf(migrated, there.locales),
        target: { kind: 'default-locale', locale: 'fr' },
        previous: there.table,
      }),
    );

    // `/docs/setup → /fr/docs/setup` then `/fr/docs/setup → /docs/setup`: the first is a loop, gone.
    expect(back.table).not.toContainEqual(expect.objectContaining({ from: '/docs' }));
    expect(back.table).toContainEqual({ from: '/fr/docs', to: '/docs' });
    // No source is a live URL, no target is a source (one hop).
    const sources = new Set(back.table.map((r) => r.from));

    for (const redirect of back.table) {
      expect(sources.has(redirect.to)).toBe(false);
      expect(redirect.from).not.toBe(redirect.to);
    }
  });

  it('a chain A → B, then B → C, becomes A → C', () => {
    const migration = value(
      planMigration({
        locales,
        collections,
        entries: entriesOf(CONTENT, locales),
        target: { kind: 'default-locale', locale: 'en' },
        // An older redirect to the French docs page, which now moves to /fr/docs.
        previous: [{ from: '/old-docs', to: '/docs' }],
      }),
    );

    expect(migration.table).toContainEqual({ from: '/old-docs', to: '/fr/docs' });
    expect(migration.table).toContainEqual({ from: '/docs', to: '/fr/docs' });
  });

  it('drops a previous redirect whose source is a live URL after the migration', () => {
    const migration = value(
      planMigration({
        locales,
        collections,
        entries: entriesOf(CONTENT, locales),
        target: { kind: 'default-locale', locale: 'en' },
        // `/fr/about` becomes the French about page's own URL.
        previous: [{ from: '/fr/about', to: '/elsewhere' }],
      }),
    );

    expect(migration.table.map((r) => r.from)).not.toContain('/fr/about');
  });
});
