import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { err, ok, type PathLister } from '@figatellultimate/core';
import { FileSystem } from '@japa/file-system';
import { afterAll, describe, expect, it } from 'vitest';

import { createNodePathLister } from '../index.js';

/** A tree: directory (project-relative POSIX) → files it contains (POSIX, relative to it). */
type Tree = Readonly<Record<string, readonly string[]>>;

interface Scenario {
  readonly name: string;
  readonly tree: Tree;
  readonly directory: string;
  /** Expected listing, sorted; `null` when the directory cannot be listed. */
  readonly expected: readonly string[] | null;
}

/** Scenarios written once, replayed on every PathLister implementation. */
const scenarios: readonly Scenario[] = [
  {
    name: 'lists nested files as POSIX paths relative to the directory, sorted',
    tree: { 'content/blog': ['cat/sub/b.mdx', 'cat/sub/en/a.mdx', 'cat/cover.png', 'a.mdx'] },
    directory: 'content/blog',
    expected: ['a.mdx', 'cat/cover.png', 'cat/sub/b.mdx', 'cat/sub/en/a.mdx'],
  },
  {
    name: 'lists files only, never directories',
    tree: { docs: ['x/y/z.mdx'] },
    directory: 'docs',
    expected: ['x/y/z.mdx'],
  },
  { name: 'returns an empty list for an empty directory', tree: { empty: [] }, directory: 'empty', expected: [] },
  { name: 'fails on a missing directory', tree: {}, directory: 'missing', expected: null },
  {
    name: 'keeps names with spaces and case as they are (diagnostics are core’s job)',
    tree: { pages: ['Foo.mdx', 'page-00 copy.mdx'] },
    directory: 'pages',
    expected: ['Foo.mdx', 'page-00 copy.mdx'],
  },
];

/** Reference implementation, from the tree itself. */
function memoryLister(tree: Tree): PathLister {
  return {
    list: (directory) => {
      const files = tree[directory];

      return Promise.resolve(files === undefined ? err({ reason: 'ENOENT' }) : ok([...files].sort()));
    },
  };
}

const projects: FileSystem[] = [];

/** Node implementation, on the same tree materialized as a disposable project. */
async function nodeLister(tree: Tree): Promise<PathLister> {
  const project = new FileSystem(join(tmpdir(), `figatellultimate-fs-node-${randomUUID()}`));

  projects.push(project);

  for (const [directory, files] of Object.entries(tree)) {
    await project.mkdir(directory);

    for (const file of files) await project.create(`${directory}/${file}`, '');
  }

  return createNodePathLister(project.basePath);
}

const memory = (tree: Tree): Promise<PathLister> => Promise.resolve(memoryLister(tree));

afterAll(async () => {
  for (const project of projects) await project.cleanup();
});

const implementations = [
  ['memory (reference)', memory],
  ['node', nodeLister],
] as const;

describe.each(implementations)('PathLister: %s', (_, create) => {
  it.each(scenarios)('$name', async ({ tree, directory, expected }) => {
    const result = await (await create(tree)).list(directory);

    expect(result.ok ? result.value : null).toEqual(expected);
  });
});

describe('createNodePathLister', () => {
  it('never returns an absolute path, nor the project root in any form', async () => {
    const lister = await nodeLister({ 'content/blog': ['cat/sub/a.mdx'] });
    const root = projects.at(-1)?.basePath ?? '';
    const result = await lister.list('content/blog');
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain(root);
    expect(serialized).not.toContain(encodeURIComponent(root));
    expect(
      result.ok && result.value.every((p) => !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !p.includes('\\')),
    ).toBe(true);
  });

  it('gives the reason of a failure without the absolute path', async () => {
    const result = await (await nodeLister({})).list('missing');

    expect(result).toEqual(err({ reason: 'ENOENT' }));
  });

  it('rejects directories outside the project (broken caller contract)', async () => {
    const lister = await nodeLister({});

    await expect(lister.list('../outside')).rejects.toThrow(TypeError);
    await expect(lister.list('/etc')).rejects.toThrow(TypeError);
  });

  it('stops when aborted', async () => {
    const lister = await nodeLister({ docs: ['a.mdx'] });
    const signal = {
      aborted: true,
      throwIfAborted: (): never => {
        throw new Error('aborted');
      },
    };

    await expect(lister.list('docs', { signal })).rejects.toThrow('aborted');
  });
});
