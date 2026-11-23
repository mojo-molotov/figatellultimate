import { describe, expect, it } from 'vitest';

import { defineCollection } from '../../declarations/collection.js';
import { locale, slug } from '../../declarations/grammar.js';
import { defineLocales } from '../../declarations/locales.js';
import { completeFrontmatter, type WrittenVersion } from '../inherit.js';

const locales = defineLocales({ list: ['fr', 'en', 'de'], default: 'fr' });
const blog = defineCollection({
  entry: 'blogPost',
  base: 'blog',
  grammar: [locale({ optional: true }), slug()],
  shared: ['cover', 'date', 'tags'],
});

/** The versions of one entry (key `lesson`), by locale. */
function entry(frontmatters: Readonly<Record<string, Readonly<Record<string, unknown>>>>) {
  const versions = new Map<string, WrittenVersion>(
    Object.entries(frontmatters).map(([code, frontmatter]) => [
      code,
      {
        descriptor: {
          collection: 'blog',
          sourcePath: code === 'fr' ? 'lesson.mdx' : `${code}/lesson.mdx`,
          locale: code,
          key: 'lesson',
        },
        frontmatter,
      },
    ]),
  );
  const complete = (code: string) => {
    const version = versions.get(code);

    if (version === undefined) throw new Error(`no ${code} version in the test`);

    return completeFrontmatter(version, blog, locales, (other) => versions.get(other));
  };

  return { complete };
}

const french = { title: 'La leçon', cover: '/covers/fr.jpeg', date: '2024-06-15', tags: ['lint'], draft: true };

describe('completeFrontmatter', () => {
  it('takes the shared fields a translation leaves out from the default locale, its own fields winning', () => {
    const { complete } = entry({ fr: french, en: { title: 'The lesson', cover: '/covers/en.jpeg' } });

    expect(complete('en')).toMatchObject({
      ok: true,
      value: {
        // `draft` is not shared: left out, it stays out.
        frontmatter: { title: 'The lesson', cover: '/covers/en.jpeg', date: '2024-06-15', tags: ['lint'] },
        changed: true,
        unresolvedShared: [],
      },
    });
    const english = complete('en');

    expect(english.ok && 'draft' in english.value.frontmatter).toBe(false);
  });

  it('leaves the default locale and a complete translation unchanged', () => {
    const { complete } = entry({ fr: french, en: { ...french, title: 'The lesson' } });

    expect(complete('fr')).toMatchObject({ ok: true, value: { frontmatter: french, changed: false } });
    expect(complete('en')).toMatchObject({ ok: true, value: { changed: false } });
  });

  it('takes every field left out from the locale `inherit:` names, along its chain, the marker removed', () => {
    const { complete } = entry({
      fr: french,
      en: { inherit: 'fr', title: 'The lesson' },
      de: { inherit: 'en', title: 'Die Lektion' },
    });
    const completed = complete('de');

    expect(completed).toMatchObject({ ok: true, value: { frontmatter: { ...french, title: 'Die Lektion' } } });
    expect(completed.ok && 'inherit' in completed.value.frontmatter).toBe(false);
  });

  it('lists the shared fields with no default version to take them from', () => {
    const { complete } = entry({ en: { title: 'The lesson', date: '2024-06-15' } });

    expect(complete('en')).toMatchObject({ ok: true, value: { unresolvedShared: ['cover', 'tags'] } });
  });

  it.each([
    [
      'an unknown locale, the closest suggested',
      { fr: french, en: { inherit: 'dee', title: 'The lesson' } },
      { code: 'unknown-inherit-locale', data: { locale: 'dee' }, suggestions: ['de'] },
    ],
    [
      'a locale with no version of the entry',
      { fr: french, en: { inherit: 'de', title: 'The lesson' } },
      { code: 'missing-inherit-source', data: { locale: 'de', key: 'lesson' } },
    ],
    [
      'a loop through the version',
      { fr: french, en: { inherit: 'de' }, de: { inherit: 'en' } },
      { code: 'inherit-cycle', data: { locales: ['en', 'de', 'en'] } },
    ],
  ])('reports %s on the version’s own file', (_, frontmatters, expected) => {
    expect(entry(frontmatters).complete('en')).toMatchObject({
      ok: false,
      errors: [{ ...expected, collection: 'blog', sourcePath: 'en/lesson.mdx' }],
    });
  });

  it('takes what a source writes when its own marker is broken: the error is the source’s alone', () => {
    const { complete } = entry({ fr: french, en: { inherit: 'de', title: 'The lesson' }, de: { inherit: 'xx' } });

    expect(complete('de').ok).toBe(false);
    expect(complete('en')).toMatchObject({
      ok: true,
      value: { frontmatter: { title: 'The lesson', date: '2024-06-15' } },
    });
  });
});
