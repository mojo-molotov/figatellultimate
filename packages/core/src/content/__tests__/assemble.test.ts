import { describe, expect, it } from 'vitest';

import { analyze, type SourceInput } from '../../paths/analyze.js';
import { assemble, type AssembleInput } from '../assemble.js';
import { defineCollection, type Collection } from '../../declarations/collection.js';
import { locale, slug } from '../../declarations/grammar.js';
import { defineTaxonomy } from '../../declarations/taxonomy.js';
import type { Diagnostic } from '../../shared/diagnostics.js';
import type { Environment, SourceDocument } from '../ports.js';
import { authors, blogWithContent, locales, tags } from '../../__tests__/scenarios/collections.js';

/** The withTestContent blog with test-only content. */
const withTestContent: Readonly<Record<string, Collection>> = { blog: blogWithContent };
/** Same without `testOnly`: focused tests only see the diagnostics they are about. */
const collections: Readonly<Record<string, Collection>> = {
  blog: defineCollection({ ...blogWithContent, testOnly: [] }),
};
const taxonomies = { tags, authors };
const production: Environment = { drafts: 'exclude', testContent: 'exclude' };
const development: Environment = { drafts: 'include', testContent: 'include' };

const post = (sourcePath: string, data: Record<string, unknown> = {}): SourceDocument => ({
  collection: 'blog',
  sourcePath,
  data: { title: sourcePath, ...data },
  body: `# ${sourcePath}`,
});

const invalidFrontmatter = (sourcePath: string): Diagnostic => ({
  code: 'missing-frontmatter-field',
  severity: 'error',
  collection: 'blog',
  sourcePath,
  data: { field: 'title' },
  suggestions: [],
});

function run(
  paths: readonly string[],
  documents: readonly SourceDocument[],
  options: Partial<Pick<AssembleInput, 'environment' | 'sourceDiagnostics' | 'collections'>> = {},
) {
  const sources: SourceInput[] = paths.map((sourcePath) => ({ collection: 'blog', sourcePath }));

  return assemble({
    analysis: analyze({ locales, collections: options.collections ?? collections, sources }),
    documents,
    sourceDiagnostics: options.sourceDiagnostics ?? [],
    collections: options.collections ?? collections,
    taxonomies,
    environment: options.environment ?? development,
  });
}

const codes = (assembly: ReturnType<typeof run>) => assembly.diagnostics.map((d) => [d.sourcePath, d.code]);

describe('assemble', () => {
  it('joins structure and documents by sourcePath', () => {
    const assembly = run(['cat/sub/a.mdx', 'cat/sub/en/a.mdx'], [post('cat/sub/a.mdx'), post('cat/sub/en/a.mdx')]);

    expect(assembly.diagnostics).toEqual([]);
    expect(assembly.entries.map((e) => [e.descriptor.key, e.descriptor.locale, e.data['title'], e.body])).toEqual([
      ['cat/sub/a', 'en', 'cat/sub/en/a.mdx', '# cat/sub/en/a.mdx'],
      ['cat/sub/a', 'fr', 'cat/sub/a.mdx', '# cat/sub/a.mdx'],
    ]);
  });

  it('an unknown locale folder is still reported when the frontmatter is invalid', () => {
    const path = 'cat/sub/drafts/x.mdx';
    const assembly = run([path], [], { sourceDiagnostics: [invalidFrontmatter(path)] });

    expect(codes(assembly)).toEqual([
      [path, 'missing-frontmatter-field'],
      [path, 'unknown-locale'],
    ]);
    expect(assembly.entries).toEqual([]);
  });

  it('excludes an entry whose frontmatter is invalid, without a missing-document error', () => {
    const assembly = run(['cat/sub/a.mdx'], [], { sourceDiagnostics: [invalidFrontmatter('cat/sub/a.mdx')] });

    expect(codes(assembly)).toEqual([['cat/sub/a.mdx', 'missing-frontmatter-field']]);
    expect(assembly.entries).toEqual([]);
  });

  it('reports a structurally valid path that got neither a document nor an error', () => {
    expect(codes(run(['cat/sub/a.mdx'], []))).toEqual([['cat/sub/a.mdx', 'missing-document']]);
  });

  it('checks taxonomy references: unknown terms with suggestions, duplicates, invalid shapes', () => {
    const assembly = run(
      ['cat/sub/a.mdx', 'cat/sub/b.mdx', 'cat/sub/c.mdx'],
      [
        post('cat/sub/a.mdx', { tags: ['cello', 'cell'], authors: 'Gustave' }),
        post('cat/sub/b.mdx', { tags: ['react', 'react'] }),
        post('cat/sub/c.mdx', { tags: 42 }),
      ],
    );

    expect(assembly.diagnostics.map((d) => [d.sourcePath, d.code, d.suggestions])).toEqual([
      ['cat/sub/a.mdx', 'unknown-taxonomy-term', ['cello']],
      ['cat/sub/b.mdx', 'duplicate-taxonomy-term', []],
      ['cat/sub/c.mdx', 'invalid-taxonomy-reference', []],
    ]);
    expect(assembly.entries).toEqual([]);
  });

  it('resolves valid references into terms, a single string counting as one term', () => {
    const [entry] = run(['cat/sub/a.mdx'], [post('cat/sub/a.mdx', { tags: ['cello'], authors: 'Arnaud' })]).entries;

    expect(entry?.terms).toEqual({ tags: ['cello'], authors: ['Arnaud'] });
  });

  it('excludes drafts and test content in production, keeps them in development', () => {
    const paths = ['cat/sub/draft.mdx', 'cat/sub/published.mdx', 'blog-testing-category/sub/t.mdx'];
    const documents = [
      post('cat/sub/draft.mdx', { draft: true }),
      post('cat/sub/published.mdx', { draft: false }),
      post('blog-testing-category/sub/t.mdx'),
    ];
    const prod = run(paths, documents, { environment: production, collections: withTestContent });

    expect(prod.entries.map((e) => e.descriptor.sourcePath)).toEqual(['cat/sub/published.mdx']);
    expect(prod.excluded).toEqual([
      { entry: { collection: 'blog', sourcePath: 'blog-testing-category/sub/t.mdx' }, reason: 'test-content' },
      { entry: { collection: 'blog', sourcePath: 'cat/sub/draft.mdx' }, reason: 'draft' },
    ]);
    const dev = run(paths, documents, { environment: development, collections: withTestContent });

    expect(dev.entries).toHaveLength(3);
    expect(dev.entries.find((e) => e.descriptor.slug === 'draft')?.draft).toBe(true);
    expect(dev.excluded).toEqual([]);
  });

  it('reports a non-boolean draft flag', () => {
    expect(codes(run(['cat/sub/a.mdx'], [post('cat/sub/a.mdx', { draft: 'yes' })]))).toEqual([
      ['cat/sub/a.mdx', 'invalid-draft-flag'],
    ]);
  });

  it('checks the declared metadata fields of every entry, with the other errors', () => {
    const withMetadata = {
      blog: defineCollection({
        ...blogWithContent,
        testOnly: [],
        metadata: { title: 'title', description: 'metadescription', tags: 'tags', publishedTime: 'date' },
      }),
    };
    const documents = [
      post('cat/sub/ok.mdx', { title: 'Ok', metadescription: 'Fine', date: '2026-11-12' }),
      post('cat/sub/bad.mdx', { title: 3, metadescription: ['no'], draft: 'yes' }),
    ];
    const result = run(['cat/sub/ok.mdx', 'cat/sub/bad.mdx'], documents, { collections: withMetadata });

    expect(result.entries.map((e) => e.descriptor.slug)).toEqual(['ok']);
    expect(result.diagnostics.map((d) => [d.sourcePath, d.code, d.data])).toEqual([
      ['cat/sub/bad.mdx', 'invalid-draft-flag', { field: 'draft' }],
      // Sorted deterministically.
      ['cat/sub/bad.mdx', 'invalid-metadata-field', { field: 'metadescription', expected: 'text' }],
      ['cat/sub/bad.mdx', 'invalid-metadata-field', { field: 'title', expected: 'text' }],
    ]);
  });

  it('checks the SEO fields: a text date, robots directives, an absolute canonical', () => {
    const withSeo = {
      blog: defineCollection({
        ...blogWithContent,
        testOnly: [],
        metadata: { modifiedTime: 'updated', robots: 'robots', canonical: 'canonical' },
      }),
    };
    const documents = [
      post('cat/sub/ok.mdx', {
        updated: '2026-11-12',
        robots: 'noindex, max-image-preview:large, max-snippet:-1',
        canonical: 'https://example.com/elsewhere',
      }),
      post('cat/sub/bad.mdx', { updated: 20261112, robots: 'hide', canonical: '/elsewhere' }),
    ];
    const result = run(['cat/sub/ok.mdx', 'cat/sub/bad.mdx'], documents, { collections: withSeo });

    expect(result.entries.map((e) => e.descriptor.slug)).toEqual(['ok']);
    expect(result.diagnostics.map((d) => d.data)).toEqual([
      { field: 'canonical', expected: 'absolute URL' },
      { field: 'robots', expected: 'robots directives' },
      { field: 'updated', expected: 'text' },
    ]);
  });

  it('checks the order field: a number, never a text', () => {
    const ordered = { blog: defineCollection({ ...blogWithContent, testOnly: [], metadata: { order: 'order' } }) };
    const documents = [post('cat/sub/first.mdx', { order: 1 }), post('cat/sub/second.mdx', { order: 'two' })];
    const result = run(['cat/sub/first.mdx', 'cat/sub/second.mdx'], documents, { collections: ordered });

    expect(result.entries.map((e) => e.descriptor.slug)).toEqual(['first']);
    expect(result.diagnostics.map((d) => [d.sourcePath, d.data])).toEqual([
      ['cat/sub/second.mdx', { field: 'order', expected: 'number' }],
    ]);
  });

  it('warns about a test-only pattern that matches nothing', () => {
    expect(run(['cat/sub/a.mdx'], [post('cat/sub/a.mdx')], { collections: withTestContent }).diagnostics).toEqual([
      expect.objectContaining({
        code: 'unused-test-only',
        sourcePath: null,
        data: { pattern: 'blog-testing-category/*' },
      }),
    ]);
  });

  it('is deterministic: the output does not depend on the order of the documents', () => {
    const paths = ['cat/sub/a.mdx', 'cat/sub/b.mdx', 'cat/sub/c.mdx'];
    const documents = paths.map((p) => post(p, { tags: ['cello'] }));
    const reversed = [...documents].reverse();

    expect(reversed).not.toEqual(documents);
    expect(run(paths, reversed)).toEqual(run(paths, documents));
  });

  it('returns frozen data and never an absolute path', () => {
    const assembly = run(['cat/sub/a.mdx', 'cat/sub/drafts/x.mdx'], [post('cat/sub/a.mdx')]);

    expect(
      Object.isFrozen(assembly) && Object.isFrozen(assembly.entries) && Object.isFrozen(assembly.diagnostics),
    ).toBe(true);
    expect(JSON.stringify(assembly.diagnostics)).not.toMatch(/"(\/|[A-Za-z]:[\\/])/);
  });

  it('throws on a reference to an undeclared taxonomy (invalid configuration)', () => {
    expect(() =>
      assemble({
        analysis: analyze({ locales, collections, sources: [] }),
        documents: [],
        sourceDiagnostics: [],
        collections,
        taxonomies: { tags },
        environment: development,
      }),
    ).toThrow(/authors/);
  });
});

describe("assemble: a taxonomy's content", () => {
  const bios = defineCollection({
    entry: 'authorBio',
    base: '',
    grammar: [locale({ optional: true }), slug()],
    mounted: false,
  });
  const team = defineTaxonomy(['gustave', 'arnaud'], { pages: { base: 'authors' }, content: 'authorBios' });
  const bio = (sourcePath: string): SourceDocument => ({ collection: 'authorBios', sourcePath, data: {}, body: '' });

  it("keeps a term's content, and reports a file named after no term, with the closest terms", () => {
    const paths = ['gustave.mdx', 'en/gustave.mdx', 'gustav.mdx'];
    const sources = paths.map((sourcePath) => ({ collection: 'authorBios', sourcePath }));
    const assembly = assemble({
      analysis: analyze({ locales, collections: { authorBios: bios }, sources }),
      documents: paths.map(bio),
      sourceDiagnostics: [],
      collections: { authorBios: bios },
      taxonomies: { team },
      environment: development,
    });

    expect(assembly.entries.map((entry) => [entry.descriptor.key, entry.descriptor.locale])).toEqual([
      ['gustave', 'en'],
      ['gustave', 'fr'],
    ]);
    expect(assembly.diagnostics.map((d) => [d.sourcePath, d.code, d.data, d.suggestions])).toEqual([
      ['gustav.mdx', 'unknown-term-content', { taxonomy: 'team', term: 'gustav' }, ['gustave']],
    ]);
  });

  it("never gives its entries a URL: one may share a page's path without colliding", () => {
    const page = defineCollection({ entry: 'page', base: '', grammar: [locale({ optional: true }), slug()] });
    const analysis = analyze({
      locales,
      collections: { pages: page, authorBios: bios },
      sources: [
        { collection: 'pages', sourcePath: 'gustave.mdx' },
        { collection: 'authorBios', sourcePath: 'gustave.mdx' },
      ],
    });

    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.entries.map((entry) => [entry.collection, entry.reserved])).toEqual([
      ['authorBios', true],
      ['pages', false],
    ]);
  });
});
