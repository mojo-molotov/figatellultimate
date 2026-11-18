import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../shared/diagnostics.js';
import { InvalidContentSourceError, loadContent, streamContent, type ContentEvent } from '../load.js';
import type { ContentSource, PathLister, SourceDocument } from '../ports.js';
import { err, ok } from '../../shared/result.js';
import { authors, blogWithContent, locales, tags } from '../../__tests__/scenarios/collections.js';
import { defineCollection } from '../../declarations/collection.js';
import { defineTaxonomy } from '../../declarations/taxonomy.js';

/** In-memory PathLister: a map from directory to the files it contains. */
function memoryLister(tree: Readonly<Record<string, readonly string[]>>): PathLister & { calls: string[] } {
  const calls: string[] = [];

  return {
    calls,
    list: (directory) => {
      calls.push(directory);
      const files = tree[directory];

      return Promise.resolve(files === undefined ? err({ reason: 'ENOENT' }) : ok(files));
    },
  };
}

/** Fake ContentSource: core is tested without Content Collections (the delegated tool stays replaceable). */
function fakeSource(
  directories: Readonly<Record<string, string>>,
  documents: readonly SourceDocument[],
  diagnostics: readonly Diagnostic[] = [],
): ContentSource {
  return {
    directories: () => Promise.resolve(directories),
    async *documents() {
      await Promise.resolve();

      for (const diagnostic of diagnostics) yield { kind: 'diagnostic', diagnostic } as const;

      for (const document of documents) yield { kind: 'document', document } as const;
    },
  };
}

const doc = (sourcePath: string): SourceDocument => ({ collection: 'blog', sourcePath, data: {}, body: '' });
const base = {
  locales,
  collections: { blog: blogWithContent },
  taxonomies: { tags, authors },
  environment: { drafts: 'include', testContent: 'include' },
} as const;

describe('loadContent', () => {
  it('lists paths in the directories given by the source, analyzes them and joins the documents', async () => {
    const paths = memoryLister({ 'content/blog': ['cat/sub/a.mdx', 'cat/sub/drafts/x.mdx', 'cover.png'] });
    const source = fakeSource({ blog: 'content/blog' }, [doc('cat/sub/a.mdx')]);
    const assembly = await loadContent({ ...base, paths, source });

    expect(paths.calls).toEqual(['content/blog']);
    expect(assembly.entries.map((e) => e.descriptor.sourcePath)).toEqual(['cat/sub/a.mdx']);
    // Declaration-level diagnostics (no source path) come first.
    expect(assembly.diagnostics.map((d) => d.code)).toEqual(['unused-test-only', 'unknown-locale']);
  });

  it('reports a term page at a folder page’s URL, once every entry is known', async () => {
    const paths = memoryLister({ 'content/blog': ['cat/sub/a.mdx'] });
    const source = fakeSource({ blog: 'content/blog' }, [
      { collection: 'blog', sourcePath: 'cat/sub/a.mdx', data: { authors: ['cat'] }, body: '' },
    ]);
    const assembly = await loadContent({
      ...base,
      collections: { blog: defineCollection({ ...blogWithContent, folderPages: { levels: ['category'] } }) },
      // A term page at `/blog/cat`: the URL of the `cat` category's page.
      taxonomies: { tags, authors: defineTaxonomy(['cat'], { pages: { base: 'blog' } }) },
      paths,
      source,
    });

    expect(assembly.entries).toHaveLength(1);
    expect(assembly.diagnostics.filter((d) => d.code === 'term-page-collision')).toEqual([
      expect.objectContaining({
        collection: 'blog',
        sourcePath: null,
        data: { url: '/blog/cat', taxonomy: 'authors', term: 'cat' },
      }),
    ]);
  });

  it('reports a directory that cannot be listed and keeps going', async () => {
    const assembly = await loadContent({ ...base, paths: memoryLister({}), source: fakeSource({ blog: 'nope' }, []) });

    expect(assembly.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'cannot-list-directory',
          collection: 'blog',
          data: { directory: 'nope', reason: 'ENOENT' },
        }),
      ]),
    );
  });

  it('throws when a collection is declared on one side only (invalid configuration)', async () => {
    const paths = memoryLister({ a: [] });

    await expect(loadContent({ ...base, paths, source: fakeSource({}, []) })).rejects.toThrow(
      InvalidContentSourceError,
    );
    await expect(loadContent({ ...base, paths, source: fakeSource({ blog: 'a', other: 'b' }, []) })).rejects.toThrow(
      InvalidContentSourceError,
    );
  });

  it('stops before loading documents when aborted', async () => {
    let loaded = false;
    const source: ContentSource = {
      directories: () => Promise.resolve({ blog: 'content/blog' }),
      async *documents() {
        loaded = true;
        await Promise.resolve();
        yield* [];
      },
    };
    // A minimal aborted signal: core does not depend on DOM or Node types for AbortSignal.
    const signal = {
      aborted: true,
      throwIfAborted: () => {
        throw new Error('aborted');
      },
    };

    await expect(loadContent({ ...base, paths: memoryLister({ 'content/blog': [] }), source, signal })).rejects.toThrow(
      'aborted',
    );
    expect(loaded).toBe(false);
  });

  it('yields each entry as soon as its document arrives, before the source ends', async () => {
    const order: string[] = [];
    const source: ContentSource = {
      directories: () => Promise.resolve({ blog: 'content/blog' }),
      async *documents() {
        for (const path of ['cat/sub/a.mdx', 'cat/sub/b.mdx']) {
          order.push(`source: ${path}`);
          await Promise.resolve();
          yield { kind: 'document', document: doc(path) } as const;
        }

        order.push('source: end');
      },
    };
    const paths = memoryLister({ 'content/blog': ['cat/sub/a.mdx', 'cat/sub/b.mdx'] });

    for await (const event of streamContent({ ...base, paths, source })) {
      order.push(event.kind === 'entry' ? `entry: ${event.entry.descriptor.sourcePath}` : 'summary');
    }

    expect(order).toEqual([
      'source: cat/sub/a.mdx',
      'entry: cat/sub/a.mdx',
      'source: cat/sub/b.mdx',
      'entry: cat/sub/b.mdx',
      'source: end',
      'summary',
    ]);
  });

  it('gives the same assembly whatever the order of the source (determinism)', async () => {
    const files = ['cat/sub/a.mdx', 'cat/sub/b.mdx', 'cat/sub/c.mdx'];
    const paths = memoryLister({ 'content/blog': files });
    const documents = files.map(doc);
    const reversed = [...documents].reverse();

    expect(reversed).not.toEqual(documents);
    const run = (docs: readonly SourceDocument[]) =>
      loadContent({ ...base, paths, source: fakeSource({ blog: 'content/blog' }, docs) });

    expect(await run(reversed)).toEqual(await run(documents));
  });

  it('ends with a summary carrying every diagnostic, including missing documents', async () => {
    const paths = memoryLister({ 'content/blog': ['cat/sub/a.mdx', 'cat/sub/b.mdx'] });
    const events: ContentEvent[] = [];

    for await (const event of streamContent({
      ...base,
      paths,
      source: fakeSource({ blog: 'content/blog' }, [doc('cat/sub/a.mdx')]),
    })) {
      events.push(event);
    }

    const last = events.at(-1);

    expect(last?.kind).toBe('summary');
    expect(last?.kind === 'summary' ? last.diagnostics.map((d) => [d.sourcePath, d.code]) : []).toEqual([
      [null, 'unused-test-only'],
      ['cat/sub/b.mdx', 'missing-document'],
    ]);
  });

  it('throws on a document delivered twice (broken source contract)', async () => {
    const paths = memoryLister({ 'content/blog': ['cat/sub/a.mdx'] });
    const source = fakeSource({ blog: 'content/blog' }, [doc('cat/sub/a.mdx'), doc('cat/sub/a.mdx')]);

    await expect(loadContent({ ...base, paths, source })).rejects.toThrow(TypeError);
  });
});
