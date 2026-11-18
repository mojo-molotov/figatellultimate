import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { defineCollection, type Collection } from '../../declarations/collection.js';
import type { Diagnostic } from '../../shared/diagnostics.js';
import { defineLocales } from '../../declarations/locales.js';
import { parseEntryPath } from '../parse.js';
import { blog, landingPages, locales, pages } from '../../__tests__/scenarios/collections.js';

const collections: Readonly<Record<string, Collection>> = { pages, blog, landingPages };

function parse(collection: string, sourcePath: string, localeDeclaration = locales) {
  const declaration = collections[collection];

  if (declaration === undefined) throw new Error(`Unknown scenario collection ${collection}`);

  return parseEntryPath(collection, declaration, localeDeclaration, sourcePath);
}

function codes(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((d) => d.code);
}

/** Shared scenarios: path → expected descriptor fields (the sample collections' grammars). */
const valid = [
  // pages: free depth, optional locale, index = folder URL
  ['pages', 'about.mdx', { locale: 'fr', localeSource: 'implicit', key: 'about', route: '/about' }],
  ['pages', 'en/about.mdx', { locale: 'en', localeSource: 'folder', key: 'about', route: '/about' }],
  [
    'pages',
    'nesting-1/nesting-2/page-00.mdx',
    { segments: { path: 'nesting-1/nesting-2' }, slug: 'page-00', key: 'nesting-1/nesting-2/page-00' },
  ],
  ['pages', 'docs/index.mdx', { isIndex: true, slug: 'index', key: 'docs', route: '/docs' }],
  ['pages', 'index.mdx', { isIndex: true, key: '', route: '/', segments: { path: '' } }],
  ['pages', 'en/index.mdx', { locale: 'en', key: '', route: '/' }],
  ['pages', 'lp/sign-up.mdx', { reserved: true, key: 'lp/sign-up' }],
  ['pages', 'de/x.mdx', { locale: 'fr', segments: { path: 'de' }, key: 'de/x' }],
  // blog: fixed depth, locale after the subcategory
  [
    'blog',
    'patch-notes/dashboard/post-01.mdx',
    {
      locale: 'fr',
      segments: { category: 'patch-notes', subcategory: 'dashboard' },
      key: 'patch-notes/dashboard/post-01',
      route: '/blog/patch-notes/dashboard/post-01',
      reserved: false,
    },
  ],
  [
    'blog',
    'patch-notes/dashboard/en/post-01.mdx',
    { locale: 'en', localeSource: 'folder', key: 'patch-notes/dashboard/post-01' },
  ],
  // landing pages: flat concatenated route
  ['landingPages', 'dummy-category/lp-00.mdx', { key: 'dummy-category/lp-00', route: '/lp/dummy-category-lp-00' }],
  ['landingPages', 'dummy-category/en/lp-00.mdx', { locale: 'en', route: '/lp/dummy-category-lp-00' }],
  ['landingPages', 'dummy-category/index.mdx', { isIndex: true, key: 'dummy-category', route: '/lp/dummy-category' }],
] as const;

const invalid = [
  ['pages', 'nesting-1/page-00 copy.mdx', ['invalid-name']],
  ['pages', 'Nesting/Foo.mdx', ['invalid-name', 'invalid-name']],
  ['blog', 'patch-notes/index.mdx', ['index-forbidden']],
  ['blog', 'patch-notes/dashboard/index.mdx', ['index-forbidden']], // no index in the blog
  ['blog', 'patch-notes/dashboard/en/index.mdx', ['index-forbidden']], // no index in the blog
  ['blog', 'patch-notes/post-01.mdx', ['unexpected-depth']],
  ['blog', 'a/b/en/c/d.mdx', ['unexpected-depth']],
  ['blog', `patch-notes/dashboard/${'x'.repeat(35)}.mdx`, ['name-too-long']],
  ['blog', 'Patch-Notes/dashboard/Post 01.mdx', ['invalid-name', 'invalid-name']],
  ['landingPages', 'index.mdx', ['index-forbidden']],
] as const;

describe('parseEntryPath: shared scenarios of the sample grammars', () => {
  it('covers a non-default locale and an index in every collection (guards against a degenerate scenario set)', () => {
    for (const collection of Object.keys(collections)) {
      const scenarios = valid.filter(([c]) => c === collection);
      const all = [...valid, ...invalid].filter(([c]) => c === collection);

      expect(scenarios.some(([, path]) => /(^|\/)en\//.test(path))).toBe(true);
      expect(all.some(([, path]) => path.endsWith('index.mdx'))).toBe(true);
    }
  });

  it.each(valid)('%s: %s', (collection, sourcePath, expected) => {
    const result = parse(collection, sourcePath);

    expect(result.ok ? result.value : codes(result.errors)).toMatchObject({ collection, sourcePath, ...expected });
  });

  it.each(invalid)('%s: %s → %j', (collection, sourcePath, expected) => {
    const result = parse(collection, sourcePath);

    expect(result.ok ? result.value : codes(result.errors)).toEqual(expected);
  });
});

describe('parseEntryPath: diagnostics', () => {
  it('a non-locale folder at the locale position is an unknown-locale error', () => {
    const result = parse('blog', 'blog-testing-category/fake-subcategory/drafts/fake-draft-01.mdx');

    expect(result).toMatchObject({
      ok: false,
      errors: [
        {
          code: 'unknown-locale',
          severity: 'error',
          collection: 'blog',
          data: { folder: 'drafts', locales: ['fr', 'en'] },
        },
      ],
    });
  });

  it('stacks independent errors of the same path: unknown locale + forbidden index + invalid name', () => {
    expect(codes(failed(parse('blog', 'blog-testing-category/fake-subcategory/posts/index.mdx')))).toEqual([
      'unknown-locale',
      'index-forbidden',
    ]);
    expect(codes(failed(parse('blog', 'Patch-Notes/dashboard/drafts/Post 01.mdx')))).toEqual([
      'unknown-locale',
      'invalid-name',
      'invalid-name',
    ]);
  });

  it('stacks a missing locale (explicit notation) with name and index errors', () => {
    const explicit = defineLocales({ list: ['fr', 'en'], default: 'fr', notation: 'explicit' });

    expect(codes(failed(parse('blog', 'Patch-Notes/dashboard/index.mdx', explicit)))).toEqual([
      'missing-locale',
      'invalid-name',
      'index-forbidden',
    ]);
    expect(codes(failed(parse('pages', 'Docs/x.mdx', explicit)))).toEqual(['missing-locale', 'invalid-name']);
  });

  it('still checks folder names when the depth is wrong', () => {
    expect(codes(failed(parse('blog', 'Patch-Notes/Post 01.mdx')))).toEqual([
      'unexpected-depth',
      'invalid-name',
      'invalid-name',
    ]);
  });

  it('reports a forbidden root index with `under: null` (indexForbiddenAtRoot)', () => {
    expect(failed(parse('landingPages', 'index.mdx'))).toEqual([
      expect.objectContaining({ code: 'index-forbidden', data: { under: null } }),
    ]);
    expect(failed(parse('blog', 'patch-notes/index.mdx'))).toEqual([
      expect.objectContaining({ code: 'index-forbidden', data: { under: 'category' } }),
    ]);
  });

  it('suggests the closest declared locale for a typo', () => {
    const result = parse('blog', 'patch-notes/dashboard/fe/post-01.mdx');

    expect(result.ok ? [] : result.errors[0].suggestions).toEqual(['fr']);
  });

  it('index yields the folder URL in every collection that allows it', () => {
    // A blog-like fixed-depth grammar that allows index files under the subcategory (`/index` kept).
    const blogWithIndex = defineCollection({ ...blog, indexForbiddenUnder: ['category'] });
    const routes = [
      parse('pages', 'docs/index.mdx'),
      parseEntryPath('blogWithIndex', blogWithIndex, locales, 'patch-notes/dashboard/index.mdx'),
      parse('landingPages', 'dummy-category/index.mdx'),
    ].map((result) => (result.ok ? result.value.route : 'error'));

    expect(routes).toEqual(['/docs', '/blog/patch-notes/dashboard', '/lp/dummy-category']);
  });

  it('accumulates independent name errors and suggests sanitized names', () => {
    const result = parse('pages', 'Nesting/page-00 copy.mdx');

    expect(result.ok ? [] : result.errors.map((d) => [d.code, d.suggestions])).toEqual([
      ['invalid-name', ['nesting']],
      ['invalid-name', ['page-00-copy']],
    ]);
  });

  it('describes the expected shape on unexpected depth', () => {
    const result = parse('blog', 'patch-notes/post-01.mdx');

    expect(result.ok ? null : result.errors[0].data).toEqual({
      expected: '<category>/<subcategory>/[<locale>/]<slug>.mdx',
      folders: 1,
    });
  });

  it('in the explicit notation, a missing locale folder is an error', () => {
    const explicit = defineLocales({ list: ['fr', 'en'], default: 'fr', notation: 'explicit' });

    expect(codes(failed(parse('pages', 'about.mdx', explicit)))).toEqual(['missing-locale']);
    expect(codes(failed(parse('blog', 'patch-notes/dashboard/post-01.mdx', explicit)))).toEqual(['missing-locale']);
    expect(parse('pages', 'fr/about.mdx', explicit)).toMatchObject({ ok: true, value: { locale: 'fr' } });
  });

  it('never puts an absolute path in a diagnostic', () => {
    const serialized = JSON.stringify([parse('blog', 'patch-notes/index.mdx'), parse('pages', 'Nesting/Foo.mdx')]);

    // No string value starts like a POSIX or Windows absolute path.
    expect(serialized).not.toMatch(/"(\/|[A-Za-z]:[\\/])/);
  });
});

describe('parseEntryPath: descriptors', () => {
  it('returns frozen descriptors', () => {
    const result = parse('blog', 'patch-notes/dashboard/post-01.mdx');

    expect(result.ok && Object.isFrozen(result.value) && Object.isFrozen(result.value.segments)).toBe(true);
  });

  it.each(['/abs.mdx', 'a\\b.mdx', 'a/../b.mdx', 'a//b.mdx', 'x.md'])(
    'throws on a source path breaking the contract: %j',
    (sourcePath) => {
      expect(() => parse('pages', sourcePath)).toThrow(TypeError);
    },
  );
});

function failed(result: ReturnType<typeof parse>): readonly Diagnostic[] {
  return result.ok ? [] : result.errors;
}

describe('parseEntryPath: properties', () => {
  /** A valid name that is neither a locale nor `index`. */
  const name = fc
    .stringMatching(/^[a-z0-9]{1,8}(-[a-z0-9]{1,8}){0,2}$/)
    .filter((n) => !['fr', 'en', 'index'].includes(n));

  it('a valid path gives its key and locale, the default locale implicit or explicit alike', () => {
    fc.assert(
      fc.property(fc.array(name, { maxLength: 4 }), name, fc.constantFrom('fr', 'en'), (folders, slug, locale) => {
        const path = [...folders, `${slug}.mdx`].join('/');
        const explicit = parse('pages', `${locale}/${path}`);

        expect(explicit).toMatchObject({ ok: true, value: { locale, key: [...folders, slug].join('/') } });

        if (locale === 'fr') {
          const implicit = parse('pages', path);

          expect(implicit.ok && explicit.ok && implicit.value.key === explicit.value.key).toBe(true);
          expect(implicit.ok && explicit.ok && implicit.value.route === explicit.value.route).toBe(true);
        }
      }),
    );
  });

  it('is total: any relative .mdx path gives a descriptor or diagnostics, in every collection', () => {
    // Any segment the contract accepts (POSIX, relative): the parser must answer every one with a value.
    const segment = fc
      .string({ minLength: 1, maxLength: 12 })
      .filter((s) => !s.includes('/') && !s.includes('\\') && s !== '.' && s !== '..');

    fc.assert(
      fc.property(
        fc.constantFrom('pages', 'blog', 'landingPages'),
        fc.array(segment, { minLength: 1, maxLength: 5 }),
        (collection, parts) => {
          const result = parse(collection, `${parts.join('/')}.mdx`);

          expect(result.ok || result.errors.length > 0).toBe(true);
        },
      ),
    );
  });
});
