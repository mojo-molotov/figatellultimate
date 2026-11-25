import {
  analyze,
  assemble,
  defineCollection,
  defineConfig,
  defineLocales,
  defineTaxonomy,
  locale,
  rest,
  segment,
  slug,
  type ContentSource,
  type FigatellultimateConfig,
  type SourceDocument,
} from '@figatellultimate/core';
import { Project, ts } from 'ts-morph';
import { describe, expect, it } from 'vitest';

import { emit, type GeneratedFile } from '../index.js';

const OUTPUT = '/project/.figatellultimate';

/** A content source that only serves `directories()`: the codegen never calls it (no I/O). */
const source: ContentSource = {
  directories: () => Promise.resolve({ pages: 'content/pages', blog: 'content/blog' }),
  async *documents() {
    yield* [];
    await Promise.resolve();
  },
};

const blogCollection = defineCollection({
  entry: 'blogPost',
  base: 'blog',
  grammar: [segment('category'), segment('subcategory'), locale({ optional: true }), slug()],
  references: { tags: 'tags' },
});

const config: FigatellultimateConfig = defineConfig({
  locales: defineLocales({ list: ['fr', 'en'], default: 'fr' }),
  collections: {
    pages: defineCollection({ entry: 'page', base: '', grammar: [locale({ optional: true }), rest('path'), slug()] }),
    blog: blogCollection,
  },
  taxonomies: { tags: defineTaxonomy(['cello', 'drums']) },
  source,
});

/** pages: `lp/sign-up` exists in both locales, `about` only in French (a missing translation). */
const files: Readonly<Record<string, readonly string[]>> = {
  pages: ['index.mdx', 'en/index.mdx', 'lp/sign-up.mdx', 'en/lp/sign-up.mdx', 'about.mdx'],
  blog: ['patch-notes/dashboard/post-01.mdx', 'patch-notes/dashboard/en/post-01.mdx', 'patch-notes/bot/post-02.mdx'],
};

function assembly(order: 'forward' | 'reverse' = 'forward') {
  const sources = Object.entries(files).flatMap(([collection, paths]) =>
    paths.map((sourcePath) => ({ collection, sourcePath })),
  );
  const documents: SourceDocument[] = sources.map(({ collection, sourcePath }) => ({
    collection,
    sourcePath,
    data: { title: `Title of ${sourcePath}`, ...(collection === 'blog' ? { tags: ['cello'] } : {}) },
    body: `Body of ${sourcePath}`,
  }));

  if (order === 'reverse') documents.reverse();

  return assemble({
    analysis: analyze({ locales: config.locales, collections: config.collections, sources }),
    documents,
    sourceDiagnostics: [],
    collections: config.collections,
    taxonomies: config.taxonomies ?? {},
    environment: { drafts: 'include', testContent: 'include' },
  });
}

const generate = (order: 'forward' | 'reverse' = 'forward'): GeneratedFile[] => [
  ...emit({ config, assembly: assembly(order), outputDirectory: OUTPUT }),
];

const file = (generated: readonly GeneratedFile[], path: string): string => {
  const found = generated.find((f) => f.path === path);

  if (found === undefined) throw new Error(`Not generated: ${path}`);

  return found.contents;
};

/** Compiles the generated modules together with an "app" file, in memory, with the TypeScript bundled by ts-morph. */
function typecheck(app: string): string[] {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      exactOptionalPropertyTypes: true,
      noUncheckedIndexedAccess: true,
    },
  });

  project.createSourceFile('/project/package.json', JSON.stringify({ type: 'module' }));

  // What an app's typecheck reads: the declarations only.
  for (const generated of generate().filter((f) => f.path.endsWith('.d.ts'))) {
    project.createSourceFile(`${OUTPUT}/${generated.path}`, generated.contents);
  }

  project.createSourceFile('/project/app.ts', app);

  return project
    .getPreEmitDiagnostics()
    .map(
      (d) =>
        `${d.getSourceFile()?.getBaseName() ?? '?'}:${String(d.getLineNumber())} ${ts.flattenDiagnosticMessageText(d.compilerObject.messageText, ' ')}`,
    );
}

describe('emit', () => {
  it('emits locales, then per collection an index (.js + .d.ts), types (.d.ts) and one data module per entry (.js)', () => {
    expect(generate().map((f) => f.path)).toEqual([
      'blog/entries/en/patch-notes/dashboard/post-01.js',
      'blog/entries/fr/patch-notes/bot/post-02.js',
      'blog/entries/fr/patch-notes/dashboard/post-01.js',
      'blog/index.d.ts',
      'blog/index.js',
      'blog/types.d.ts',
      'locales/index.d.ts',
      'locales/index.js',
      'pages/entries/en/_root.js',
      'pages/entries/en/lp/sign-up.js',
      'pages/entries/fr/_root.js',
      'pages/entries/fr/about.js',
      'pages/entries/fr/lp/sign-up.js',
      'pages/index.d.ts',
      'pages/index.js',
      'pages/types.d.ts',
      'taxonomies/index.d.ts',
      'taxonomies/index.js',
      'urls/index.d.ts',
      'urls/index.js',
    ]);
  });

  it('emits the facet indexes of collections that reference taxonomies, keyed by entry URL', () => {
    const generated = generate();

    expect(file(generated, 'blog/index.js')).toContain('export const blogFacets = { "tags": { "cello": [');
    expect(file(generated, 'blog/index.d.ts')).toContain('export declare const blogFacets');
    // pages references no taxonomy: no phony export.
    expect(file(generated, 'pages/index.js')).not.toContain('Facets');
  });

  it('is deterministic: byte-identical output whatever the order of the documents', () => {
    expect(generate('reverse')).toEqual(generate());
  });

  it('never writes an absolute path in generated code', () => {
    expect(JSON.stringify(generate())).not.toContain('/project');
  });

  it('marks every file as generated', () => {
    expect(generate().every((f) => f.contents.startsWith('// Generated by figatellultimate.'))).toBe(true);
  });

  it('emits readable types and index modules (snapshots)', () => {
    const generated = generate();

    expect(file(generated, 'locales/index.js')).toMatchSnapshot();
    expect(file(generated, 'locales/index.d.ts')).toMatchSnapshot();
    expect(file(generated, 'blog/types.d.ts')).toMatchSnapshot();
    expect(file(generated, 'blog/index.js')).toMatchSnapshot();
    expect(file(generated, 'blog/index.d.ts')).toMatchSnapshot();
    expect(file(generated, 'pages/entries/fr/lp/sign-up.js')).toMatchSnapshot();
  });
});

describe('generated getters (types)', () => {
  it('control: the in-memory compiler does report errors (so a clean result is meaningful)', () => {
    expect(typecheck("export const wrong: number = 'a';")).toHaveLength(1);
  });

  it('compile cleanly on their own', () => {
    expect(typecheck('export {};')).toEqual([]);
  });

  it('type every metadata field a collection can declare, its order field included', () => {
    const app = `
import { metadataFields } from './.figatellultimate/urls/index.js';

export const order: string | undefined = metadataFields.pages.order;
`;

    expect(typecheck(app)).toEqual([]);
  });

  it('accept existing tuples only, with dependent narrowing, and require every locale for a union', () => {
    const app = `
import { getBlogPost, findBlogPost, listBlog, isBlogPostQuery, type BlogPost } from './.figatellultimate/blog/index.js';
import { getPage, findPage } from './.figatellultimate/pages/index.js';
import type { Locale } from './.figatellultimate/locales/index.js';

declare const anyLocale: Locale;
declare const fromUrl: string;

export async function ok(): Promise<void> {
  const post: BlogPost = await getBlogPost({ locale: 'en', category: 'patch-notes', subcategory: 'dashboard', slug: 'post-01' });
  void post.data; void post.body; void post.url;
  // The full Locale union is accepted for an entry that exists in every locale.
  await getPage({ locale: anyLocale, path: 'lp/sign-up' });
  await getPage({ locale: 'fr', path: '' });
  const maybe: BlogPost | undefined = await findBlogPost({ locale: fromUrl, category: fromUrl, subcategory: fromUrl, slug: fromUrl });
  void maybe;
  void (await findPage({ locale: fromUrl, path: fromUrl }));
  const items = listBlog({ locale: 'fr', category: 'patch-notes' });
  void items;
  const value: unknown = {};
  if (isBlogPostQuery(value)) await getBlogPost(value);
}

export async function rejected(): Promise<void> {
  // @ts-expect-error unknown path
  await getPage({ locale: 'en', path: 'nonexistent' });
  // @ts-expect-error 'about' has no English version: a missing translation fails the typecheck
  await getPage({ locale: anyLocale, path: 'about' });
  // @ts-expect-error 'bot' is not a subcategory of this post in English (dependent narrowing)
  await getBlogPost({ locale: 'en', category: 'patch-notes', subcategory: 'bot', slug: 'post-02' });
  // @ts-expect-error strings from the URL must go through findBlogPost
  await getBlogPost({ locale: fromUrl, category: 'patch-notes', subcategory: 'dashboard', slug: 'post-01' });
}
`;

    expect(typecheck(app)).toEqual([]);
  });
});

describe('generated getters at scale', () => {
  it('typecheck 2,000 posts × 2 locales without "union type too complex" (TS2590), with every guarantee', () => {
    const blogOnly = defineConfig({ ...config, collections: { blog: blogCollection } });
    const sources = Array.from({ length: 2000 }, (_, i) => [
      { collection: 'blog', sourcePath: `cat-${String(i % 20)}/sub-${String(i % 7)}/post-${String(i)}.mdx` },
      // post-0 has no English version.
      ...(i === 0
        ? []
        : [{ collection: 'blog', sourcePath: `cat-${String(i % 20)}/sub-${String(i % 7)}/en/post-${String(i)}.mdx` }]),
    ]).flat();
    const big = assemble({
      analysis: analyze({ locales: blogOnly.locales, collections: blogOnly.collections, sources }),
      documents: sources.map((s) => ({ ...s, data: {}, body: '' })),
      sourceDiagnostics: [],
      collections: blogOnly.collections,
      taxonomies: blogOnly.taxonomies ?? {},
      environment: { drafts: 'include', testContent: 'include' },
    });

    // Precondition: the scenario really is big.
    expect(big.entries).toHaveLength(3999);
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
      },
    });

    project.createSourceFile('/project/package.json', JSON.stringify({ type: 'module' }));

    for (const generated of emit({ config: blogOnly, assembly: big, outputDirectory: OUTPUT })) {
      // Declarations only: what an app's typecheck reads; the 3,999 entry modules are never part of it.
      if (!generated.path.endsWith('.d.ts')) continue;

      project.createSourceFile(`${OUTPUT}/${generated.path}`, generated.contents);
    }

    project.createSourceFile(
      '/project/app.ts',
      `
import { getBlogPost } from './.figatellultimate/blog/index.js';
import type { Locale } from './.figatellultimate/locales/index.js';
declare const anyLocale: Locale;
export async function app(): Promise<void> {
  await getBlogPost({ locale: anyLocale, category: 'cat-2', subcategory: 'sub-2', slug: 'post-2' });
  // @ts-expect-error post-0 misses its English translation
  await getBlogPost({ locale: anyLocale, category: 'cat-0', subcategory: 'sub-0', slug: 'post-0' });
  // @ts-expect-error post-1 is in sub-1, not in sub-2 (dependent narrowing)
  await getBlogPost({ locale: 'fr', category: 'cat-1', subcategory: 'sub-2', slug: 'post-1' });
}
`,
    );
    const diagnostics = project
      .getPreEmitDiagnostics()
      .map((d) => ts.flattenDiagnosticMessageText(d.compilerObject.messageText, ' '));

    expect(diagnostics).toEqual([]);
  });
});
