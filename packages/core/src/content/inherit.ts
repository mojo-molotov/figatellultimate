/**
 * Frontmatter inheritance between translations: a translation writes only what differs, and takes the rest from
 * another version of the same entry (same collection and key), instead of copying it by hand.
 *
 *     inherit: en  ──> every field it leaves out, from the `en` version (itself completed, along its own `inherit:`)
 *     shared: [...] ──> each listed field it leaves out, from the default locale's version (the collection declares)
 *
 *     the version's own fields  >  its `inherit:` source's  >  the default locale's `shared` fields
 *
 * Key design decisions:
 *     - Translations are linked by their key, as everywhere: no path to write, `inherit:` names a locale only.
 *     - Both ways, as chosen with the user: a collection declares its shared fields once (a cover, a date, authors,
 *       tags), and a file can take every field it leaves out from another locale with `inherit:`.
 *     - The translation wins: a field it writes is its own (a localized cover stays possible).
 *     - Pure, on the frontmatter as written: the completed frontmatter is then validated by the collection's schema
 *       (`ContentSource.validate`), so that the types stay the schema's, a required field still required.
 *     - A required shared field with no version in the default locale to take it from is a `missing-shared-field`
 *       error; an optional one stays empty, as in a file that leaves it out.
 *     - `inherit:` names a declared locale with a version of the entry, else an error; versions inheriting from each
 *       other in a loop are an `inherit-cycle` error. A source whose own `inherit:` is broken gives what it writes:
 *       its error is reported on its own file, once.
 *
 * Invariants (`inherit.test.ts`, and `load.test.ts` through the ports): the order of precedence above, the marker
 * never left in the frontmatter, each broken marker an error on its own file.
 */
import type { Collection } from '../declarations/collection.js';
import type { Locales } from '../declarations/locales.js';
import type { EntryDescriptor } from '../paths/descriptor.js';
import { INHERIT_FIELD } from '../shared/inherit-field.js';
import type {
  InheritCycleDiagnostic,
  MissingInheritSourceDiagnostic,
  UnknownInheritLocaleDiagnostic,
} from '../shared/diagnostics.js';
import { diagnostic } from '../shared/diagnostics.js';
import { err, ok, type Result } from '../shared/result.js';
import { suggest } from '../shared/suggest.js';

type Frontmatter = Readonly<Record<string, unknown>>;

/** A version of an entry: its locale and the frontmatter it writes. */
export interface WrittenVersion {
  readonly descriptor: Pick<EntryDescriptor, 'collection' | 'sourcePath' | 'locale' | 'key'>;
  readonly frontmatter: Frontmatter;
}

/** The completed frontmatter of a version, and what it needs from its validation. */
export interface CompletedFrontmatter {
  /** Its own fields, then its source's, then the shared ones; never the `inherit:` marker. */
  readonly frontmatter: Frontmatter;
  /** Whether it differs from what the file writes: then it must be validated again. */
  readonly changed: boolean;
  /** The shared fields it leaves out with no version in the default locale to take them from. */
  readonly unresolvedShared: readonly string[];
}

/** Every way `inherit:` can be broken. */
export type InheritDiagnostic =
  UnknownInheritLocaleDiagnostic | MissingInheritSourceDiagnostic | InheritCycleDiagnostic;

const withoutMarker = (frontmatter: Frontmatter): Frontmatter =>
  Object.fromEntries(Object.entries(frontmatter).filter(([field]) => field !== INHERIT_FIELD));

/** The versions a version's `inherit:` leads to, itself first; an error only for its own marker. */
function chainOf(
  version: WrittenVersion,
  locales: Locales,
  versionOf: (locale: string) => WrittenVersion | undefined,
): Result<readonly WrittenVersion[], InheritDiagnostic> {
  const chain: WrittenVersion[] = [version];
  const { collection, sourcePath, key } = version.descriptor;
  const located = { severity: 'error', collection, sourcePath, suggestions: [] } as const;

  for (let current = version; INHERIT_FIELD in current.frontmatter;) {
    const own = current === version;
    const marker = current.frontmatter[INHERIT_FIELD];
    const locale = typeof marker === 'string' ? marker : String(marker);

    if (!locales.list.includes(locale)) {
      return own
        ? err(
            diagnostic({
              ...located,
              code: 'unknown-inherit-locale',
              data: { locale },
              suggestions: suggest(locale, locales.list),
            }),
          )
        : ok(chain);
    }

    const next = versionOf(locale);

    if (next === undefined) {
      return own ? err(diagnostic({ ...located, code: 'missing-inherit-source', data: { locale, key } })) : ok(chain);
    }

    if (chain.some((seen) => seen.descriptor.locale === locale)) {
      const locales = [...chain.map((seen) => seen.descriptor.locale), locale];

      // A loop through this version is its error; one further along is its members'.
      return locale === version.descriptor.locale
        ? err(diagnostic({ ...located, code: 'inherit-cycle', data: { locales } }))
        : ok(chain);
    }

    chain.push(next);
    current = next;
  }

  return ok(chain);
}

/** The frontmatter along a chain: the first version's fields win. */
const merged = (chain: readonly WrittenVersion[]): Frontmatter =>
  Object.fromEntries([...chain].reverse().flatMap((version) => Object.entries(withoutMarker(version.frontmatter))));

/**
 * A version's frontmatter, completed from the other versions of its entry: its `inherit:` source's fields, then its
 * collection's `shared` fields from the default locale's version.
 *
 * @param version - The version: where it is, and the frontmatter it writes.
 * @param collection - Its collection: the `shared` fields.
 * @param locales - The site's locales: the default one, and those `inherit:` may name.
 * @param versionOf - The version of the same entry in a locale, if any.
 * @returns The completed frontmatter, or the error of its own `inherit:` marker.
 *
 * @example
 * completeFrontmatter(english, blog, locales, (locale) => versions.get(locale));
 * // { frontmatter: { title: 'Hello', cover: '/covers/hello.jpeg' }, changed: true, unresolvedShared: [] }
 */
export function completeFrontmatter(
  version: WrittenVersion,
  collection: Collection,
  locales: Locales,
  versionOf: (locale: string) => WrittenVersion | undefined,
): Result<CompletedFrontmatter, InheritDiagnostic> {
  const chain = chainOf(version, locales, versionOf);

  if (!chain.ok) return chain;

  const frontmatter: Record<string, unknown> = merged(chain.value);
  const unresolvedShared: string[] = [];
  const isDefault = version.descriptor.locale === locales.default;
  const missing = isDefault ? [] : collection.shared.filter((field) => !(field in frontmatter));

  if (missing.length > 0) {
    const source = versionOf(locales.default);
    const shared = source === undefined ? undefined : chainOf(source, locales, versionOf);
    // A default version whose own marker is broken gives what it writes: its error is its file's.
    const sourceFields = source === undefined ? {} : merged(shared?.ok === true ? shared.value : [source]);

    for (const field of missing) {
      if (field in sourceFields) frontmatter[field] = sourceFields[field];
      else if (source === undefined) unresolvedShared.push(field);
    }
  }

  const written = version.frontmatter;
  const changed = INHERIT_FIELD in written || Object.keys(frontmatter).some((field) => !(field in written));

  return ok({ frontmatter: Object.freeze(frontmatter), changed, unresolvedShared: Object.freeze(unresolvedShared) });
}
