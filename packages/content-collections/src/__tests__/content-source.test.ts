import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import {
  defineCollection,
  defineLocales,
  defineTaxonomy,
  loadContent,
  locale,
  segment,
  slug,
  type ContentSource,
  type Diagnostic,
  type SourceDocument,
} from '@figatellu/core';
import { createNodePathLister } from '@figatellu/fs-node';
import { FileSystem } from '@japa/file-system';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createContentCollectionsSource, withFigatellu } from '../index.js';

/** Collects a source's stream into documents and diagnostics. */
async function load(source: ContentSource): Promise<{ documents: SourceDocument[]; diagnostics: Diagnostic[] }> {
  const documents: SourceDocument[] = [];
  const diagnostics: Diagnostic[] = [];

  for await (const event of source.documents()) {
    if (event.kind === 'document') documents.push(event.document);
    else diagnostics.push(event.diagnostic);
  }

  return { documents, diagnostics };
}

const PACKAGE = join(import.meta.dirname, '..', '..');
// `config.ts` has no import, so the generated config can load it straight from the sources.
const ADAPTER_SOURCE = join(PACKAGE, 'src', 'config.ts').replaceAll('\\', '/');

/** Content shared by both schema libraries: valid, invalid frontmatter, broken YAML, structural error. */
const CONTENT: Readonly<Record<string, string>> = {
  'content/blog/cat/sub/ok.mdx': '---\ntitle: OK\ntags: [cello]\n---\nBody of ok.\n',
  'content/blog/cat/sub/en/ok.mdx': '---\ntitle: OK (en)\n---\nBody of ok (en).\n',
  'content/blog/cat/sub/no-title.mdx': '---\ntags: [cello]\n---\nNo title.\n',
  'content/blog/cat/sub/bad-type.mdx': '---\ntitle: 42\n---\nTitle is a number.\n',
  'content/blog/cat/sub/broken-yaml.mdx': '---\ntitle: [unclosed\n---\nBroken YAML.\n',
  'content/blog/cat/sub/drafts/x.mdx': '---\ndraft: true\n---\nNo title, unknown locale folder.\n',
};

const SCHEMAS = {
  valibot: {
    import: "import * as v from 'valibot';",
    schema:
      'v.object({ title: v.string(), tags: v.optional(v.array(v.string()), []), draft: v.optional(v.boolean(), false), content: v.string() })',
  },
  zod: {
    import: "import { z } from 'zod';",
    schema:
      'z.object({ title: z.string(), tags: z.array(z.string()).default([]), draft: z.boolean().default(false), content: z.string() })',
  },
} as const;

/** A user's Content Collections config, wrapped with withFigatellu. */
const config = (library: { readonly import: string; readonly schema: string }): string => `
import { defineCollection, defineConfig } from '@content-collections/core';
${library.import}
import { withFigatellu } from ${JSON.stringify(ADAPTER_SOURCE)};

const blog = withFigatellu(
  defineCollection({ name: 'blog', directory: 'content/blog', include: '**/*.mdx', schema: ${library.schema} }),
);
export default defineConfig({ content: [blog] });
`;

// Disposable project, in the package's gitignored `.tmp/`: inside the package so that the configs resolve
// their dependencies, outside `node_modules` because watchers ignore it.
const project = new FileSystem(join(PACKAGE, '.tmp', randomUUID()));
const FIXTURES = project.basePath;

beforeAll(async () => {
  for (const [path, contents] of Object.entries(CONTENT)) await project.create(path, contents);

  for (const [name, library] of Object.entries(SCHEMAS)) {
    await project.create(`${name}.content-collections.ts`, config(library));
  }
});

afterAll(() => project.cleanup());

const summarize = (diagnostics: readonly Diagnostic[]) =>
  diagnostics.map((d) => [d.sourcePath, d.code, 'field' in d.data ? d.data.field : null]);

/** The same scenario, replayed with each schema library (Standard Schema: the delegated tool is agnostic). */
describe.each(['valibot', 'zod'])('createContentCollectionsSource (%s schema)', (library) => {
  const source = () =>
    createContentCollectionsSource({
      configPath: join(FIXTURES, `${library}.content-collections.ts`),
      projectRoot: FIXTURES,
    });

  it('exposes the collection directories, relative to the project root (single declaration)', async () => {
    expect(await source().directories()).toEqual({ blog: 'content/blog' });
  });

  it('delivers valid documents without guessing generated export names', async () => {
    const { documents } = await load(source());

    expect(documents.map((d) => [d.collection, d.sourcePath])).toEqual([
      ['blog', 'cat/sub/en/ok.mdx'],
      ['blog', 'cat/sub/ok.mdx'],
    ]);
    const ok = documents.find((d) => d.sourcePath === 'cat/sub/ok.mdx');

    expect(ok?.data).toEqual({ title: 'OK', tags: ['cello'], draft: false });
    expect(ok?.body).toContain('Body of ok.');
  });

  it('maps errors to figatellu diagnostics: missing fields established by figatellu, others field by field', async () => {
    const { diagnostics } = await load(source());

    // Content Collections drops a file with unparsable YAML silently (no event, no document): figatellu reports it
    // as `missing-document` because it lists paths itself, see the loadContent test below.
    expect(summarize(diagnostics)).toEqual([
      ['cat/sub/bad-type.mdx', 'invalid-frontmatter-field', 'title'],
      ['cat/sub/drafts/x.mdx', 'missing-frontmatter-field', 'title'],
      ['cat/sub/no-title.mdx', 'missing-frontmatter-field', 'title'],
    ]);
    expect(diagnostics.every((d) => d.collection === 'blog' && d.severity === 'error')).toBe(true);
  });

  it('gives generated types the data type of a collection, at type level only, with a relative import', async () => {
    const instance = source();

    await instance.directories();
    const typeSource = instance.typeSource?.('blog', join(FIXTURES, '.figatellu', 'blog'));

    expect(typeSource).toEqual({
      imports: [
        { moduleSpecifier: '@content-collections/core', namedImports: ['GetTypeByName'] },
        { moduleSpecifier: `../../${library}.content-collections.ts`, defaultImport: 'contentCollectionsConfig' },
      ],
      type: `Omit<GetTypeByName<typeof contentCollectionsConfig, "blog">, '_meta' | 'content'>`,
    });
    expect(instance.typeSource?.('unknown', FIXTURES)).toBeUndefined();
  });

  it('never leaks an absolute path, raw or URL-encoded', async () => {
    const serialized = JSON.stringify(await load(source()));

    expect(serialized).not.toContain(FIXTURES);
    expect(serialized).not.toContain(encodeURIComponent(FIXTURES));
  });
});

describe('loadContent with Content Collections and the Node lister', () => {
  it('an unknown locale folder is still reported when the frontmatter is invalid', async () => {
    const assembly = await loadContent({
      locales: defineLocales({ list: ['fr', 'en'], default: 'fr' }),
      collections: {
        blog: defineCollection({
          entry: 'blogPost',
          base: 'blog',
          grammar: [segment('category'), segment('subcategory'), locale({ optional: true }), slug()],
          references: { tags: 'tags' },
          draft: 'draft',
        }),
      },
      taxonomies: { tags: defineTaxonomy(['cello']) },
      environment: { drafts: 'include', testContent: 'include' },
      paths: createNodePathLister(FIXTURES),
      source: createContentCollectionsSource({
        configPath: join(FIXTURES, 'valibot.content-collections.ts'),
        projectRoot: FIXTURES,
      }),
    });

    expect(summarize(assembly.diagnostics).filter(([path]) => path === 'cat/sub/drafts/x.mdx')).toEqual([
      ['cat/sub/drafts/x.mdx', 'missing-frontmatter-field', 'title'],
      ['cat/sub/drafts/x.mdx', 'unknown-locale', null],
    ]);
    // Silently dropped by Content Collections, caught by figatellu because it lists paths itself.
    expect(summarize(assembly.diagnostics).filter(([path]) => path === 'cat/sub/broken-yaml.mdx')).toEqual([
      ['cat/sub/broken-yaml.mdx', 'missing-document', null],
    ]);
    expect(assembly.entries.map((e) => [e.descriptor.key, e.descriptor.locale, e.terms])).toEqual([
      ['cat/sub/ok', 'en', { tags: [] }],
      ['cat/sub/ok', 'fr', { tags: ['cello'] }],
    ]);
  });
});

describe('createContentCollectionsSource: watch', () => {
  it('signals content changes through the delegated watcher, until stopped', async () => {
    const source = createContentCollectionsSource({
      configPath: join(FIXTURES, 'valibot.content-collections.ts'),
      projectRoot: FIXTURES,
    });
    let changes = 0;
    let resolveChange: () => void = () => undefined;
    const changed = new Promise<void>((resolve) => {
      resolveChange = resolve;
    });
    const watcher = await source.watch?.(() => {
      changes += 1;
      resolveChange();
    });

    try {
      // The native watcher needs a moment after subscribing before it reports events.
      await new Promise((resolve) => setTimeout(resolve, 500));
      await project.create('content/blog/cat/sub/new.mdx', '---\ntitle: New\n---\nNew post.\n');
      await changed;
      expect(changes).toBeGreaterThan(0);
    } finally {
      await watcher?.stop();
      await project.remove('content/blog/cat/sub/new.mdx');
    }
  }, 20_000);
});

describe('withFigatellu', () => {
  it('keeps the collection as is and chains the user’s own onSuccess', async () => {
    const calls: unknown[] = [];
    const collection = {
      name: 'x',
      directory: 'x',
      onSuccess: (documents: unknown[]): Promise<void> => {
        calls.push(documents);

        return Promise.resolve();
      },
    };
    const wrapped = withFigatellu(collection);

    expect(wrapped.name).toBe('x');
    // Outside an adapter build, documents are not captured: only the user's hook runs.
    await wrapped.onSuccess([1, 2]);
    expect(calls).toEqual([[1, 2]]);
  });
});
