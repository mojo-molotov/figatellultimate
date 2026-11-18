/**
 * Migrations, pure: an entry's path under another locale declaration, and the plan of a migration (moves, URLs that
 * change, redirects). The CLI applies a plan.
 *
 * Invariants (`migration.test.ts`): `entryPathOf` is `parseEntryPath`'s inverse under any default locale and
 * notation; a migration there and back gives the original paths; the plan never loses or merges an entry; redirect
 * tables compose in one hop.
 */
import type { Collection } from '../declarations/collection.js';
import type { Locales, LocaleNotation } from '../declarations/locales.js';
import type { Diagnostic } from '../shared/diagnostics.js';
import { err, ok, type Result } from '../shared/result.js';
import { suggest } from '../shared/suggest.js';
import { analyze } from './analyze.js';
import type { EntryDescriptor } from './descriptor.js';
import { createUrlBuilder, type UrlOptions } from './url.js';

/** What a source path is made of: what `parseEntryPath` reads from it. */
export interface EntryPathParts {
  readonly locale: string;
  readonly segments: Readonly<Record<string, string>>;
  /** The file name without `.mdx`; `'index'` for an index file. */
  readonly slug: string;
}

/**
 * The source path of an entry under a locale declaration: `parseEntryPath`'s inverse.
 *
 * @param collection - The entry's collection.
 * @param locales - The locale declaration (default locale, notation).
 * @param entry - The entry's locale, segments and slug.
 * @returns Its path: the locale folder where the grammar places it, left out only for the default locale of an
 *   optional locale part in the implicit notation.
 *
 * @example
 * entryPathOf(blog, defineLocales({ list: ['fr', 'en'], default: 'en' }), { locale: 'en', segments, slug: 'v0-1-0' });
 * // 'release-notes/core/v0-1-0.mdx'
 */
export function entryPathOf(collection: Collection, locales: Locales, entry: EntryPathParts): string {
  const folders = collection.grammar.flatMap((part): string[] => {
    switch (part.kind) {
      case 'segment':
        return [entry.segments[part.name] ?? ''];
      case 'rest':
        return (entry.segments[part.name] ?? '').split('/').filter((folder) => folder !== '');
      case 'locale':
        return part.optional && locales.notation === 'implicit' && entry.locale === locales.default
          ? []
          : [entry.locale];
      case 'slug':
        return [];
    }
  });

  return [...folders, `${entry.slug}.mdx`].join('/');
}

/** What a migration changes: the default locale, or the notation (implicit or explicit locale folders). */
export type MigrationTarget =
  | { readonly kind: 'default-locale'; readonly locale: string }
  | { readonly kind: 'notation'; readonly notation: LocaleNotation };

/** A file to move, inside its collection: source paths before and after. */
export interface MigrationMove {
  readonly collection: string;
  readonly from: string;
  readonly to: string;
}

/** A permanent redirect from an old URL to its new one. */
export interface MigrationRedirect {
  readonly from: string;
  readonly to: string;
}

/** A migration's plan: the new declaration, the moves, this migration's redirects and the table to keep. Nothing written. */
export interface MigrationPlan {
  /** The migrated declaration. */
  readonly locales: Locales;
  /** Entries whose source path changes, in descriptor order. */
  readonly moves: readonly MigrationMove[];
  /** Mounted entries whose URL changes (a default-locale change with unprefixed default URLs), sorted. */
  readonly redirects: readonly MigrationRedirect[];
  /** Old URLs another entry uses after the migration: not redirected, it would hide that entry. Sorted. */
  readonly reused: readonly string[];
  /**
   * The redirect table to keep: the previous one composed with this migration's redirects, every old link
   * reaching its page in one hop, no source a live URL. Sorted by source.
   */
  readonly table: readonly MigrationRedirect[];
}

/** Why a migration cannot be planned: an undeclared target locale, or a migrated tree with errors. */
export type MigrationDiagnostic =
  | {
      readonly code: 'migration-unknown-locale';
      readonly severity: 'error';
      readonly data: { readonly locale: string; readonly locales: readonly string[] };
      readonly suggestions: readonly string[];
    }
  | {
      readonly code: 'migration-conflict';
      readonly severity: 'error';
      /** The migrated tree's errors (a collision, for instance), on the paths it would have. */
      readonly data: { readonly diagnostics: readonly Diagnostic[] };
      readonly suggestions: readonly string[];
    };

/** A migration that changes nothing: the target is already the current state. */
export interface MigrationWarning {
  readonly code: 'migration-no-change';
  readonly severity: 'warning';
  readonly data: { readonly target: MigrationTarget };
  readonly suggestions: readonly string[];
}

/** What `planMigration` reads: the declarations, the current entries, the target and the earlier redirect table. */
export interface MigrationInput {
  readonly locales: Locales;
  readonly collections: Readonly<Record<string, Collection>>;
  readonly urls?: UrlOptions | undefined;
  /** The structurally valid entries, from `analyze` on a tree without errors. */
  readonly entries: readonly EntryDescriptor[];
  readonly target: MigrationTarget;
  /** The redirect table of earlier migrations (`redirects.json`), composed with this one's. */
  readonly previous?: readonly MigrationRedirect[] | undefined;
}

const byCode = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Plans a migration of the default locale or of the notation.
 *
 * @param input - The current locales, the collections, the URL options, the entries' descriptors, the target (a new
 *   default locale or notation), and the earlier redirect table.
 * @returns The moves, the new tree analyzed with the migrated declaration, and the redirects (composed with the
 *   earlier ones: one hop, loops dropped; reserved entries never redirected); or the diagnostics failing the plan (a
 *   collision, an overwritten file, an unknown locale folder, an implicit and explicit twin). Writes nothing.
 *
 * @example
 * const plan = planMigration({
 *   locales, collections, entries: analysis.entries,
 *   target: { kind: 'default-locale', locale: 'en' },
 *   previous: redirects,
 * });
 * if (plan.ok) apply(plan.value.moves);
 */
export function planMigration(input: MigrationInput): Result<MigrationPlan, MigrationDiagnostic, MigrationWarning> {
  const { locales, collections, entries, target } = input;

  if (target.kind === 'default-locale' && !locales.list.includes(target.locale)) {
    return err({
      code: 'migration-unknown-locale',
      severity: 'error',
      data: { locale: target.locale, locales: locales.list },
      suggestions: suggest(target.locale, locales.list),
    });
  }

  const migrated: Locales = Object.freeze(
    target.kind === 'default-locale'
      ? { ...locales, default: target.locale }
      : { ...locales, notation: target.notation },
  );
  const unchanged = migrated.default === locales.default && migrated.notation === locales.notation;

  if (unchanged) {
    const empty: MigrationPlan = Object.freeze({
      locales,
      moves: [],
      redirects: [],
      reused: [],
      table: Object.freeze([...(input.previous ?? [])]),
    });

    return ok(empty, [{ code: 'migration-no-change', severity: 'warning', data: { target }, suggestions: [] }]);
  }

  const moves: MigrationMove[] = [];
  const sources = entries.map((entry) => {
    const collection = collections[entry.collection];

    if (collection === undefined) {
      throw new TypeError(`planMigration: entry of an undeclared collection "${entry.collection}".`);
    }

    const to = entryPathOf(collection, migrated, entry);

    if (to !== entry.sourcePath)
      moves.push(Object.freeze({ collection: entry.collection, from: entry.sourcePath, to }));

    return { collection: entry.collection, sourcePath: to };
  });

  const newUrls = createUrlBuilder(migrated, input.urls);
  const analysis = analyze({ locales: migrated, collections, sources, urls: newUrls });
  const errors = analysis.diagnostics.filter((d) => d.severity === 'error');

  if (errors.length > 0 || analysis.entries.length !== entries.length) {
    return err({ code: 'migration-conflict', severity: 'error', data: { diagnostics: errors }, suggestions: [] });
  }

  // URLs only depend on an entry's locale and route, which a migration keeps: compare both strategies.
  const oldUrls = createUrlBuilder(locales, input.urls);
  const used = new Set(entries.map((entry) => newUrls.url(entry)));
  const redirects: MigrationRedirect[] = [];
  const reused = new Set<string>();

  for (const entry of entries) {
    if (entry.reserved) continue;

    const from = oldUrls.url(entry);
    const to = newUrls.url(entry);

    if (from === to) continue;

    if (used.has(from)) reused.add(from);
    else redirects.push(Object.freeze({ from, to }));
  }

  return ok(
    Object.freeze({
      locales: migrated,
      moves: Object.freeze(moves),
      redirects: Object.freeze(redirects.sort((a, b) => byCode(a.from, b.from))),
      reused: Object.freeze([...reused].sort(byCode)),
      table: compose(input.previous ?? [], redirects, used),
    }),
  );
}

/**
 * An earlier table followed by this migration's redirects: earlier targets that moved follow them (one hop),
 * sources that are live URLs again are dropped (loops vanish), this migration's redirects win on a shared source.
 */
function compose(
  previous: readonly MigrationRedirect[],
  current: readonly MigrationRedirect[],
  live: ReadonlySet<string>,
): readonly MigrationRedirect[] {
  const next = new Map(current.map((r) => [r.from, r.to]));
  const table = new Map<string, string>();

  for (const { from, to } of previous) table.set(from, next.get(to) ?? to);

  for (const [from, to] of next) table.set(from, to);

  return Object.freeze(
    [...table]
      .filter(([from, to]) => from !== to && !live.has(from))
      .sort(([a], [b]) => byCode(a, b))
      .map(([from, to]) => Object.freeze({ from, to })),
  );
}
