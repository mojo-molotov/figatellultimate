import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GENERATED_HEADER } from '@figatellu/core';
import { FileSystem } from '@japa/file-system';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createNodeFileWriter } from '../index.js';

const generated = (path: string, body: string) => ({ path, contents: `${GENERATED_HEADER}\n${body}\n` });

let project: FileSystem;
let output: string;

beforeEach(() => {
  project = new FileSystem(join(tmpdir(), `figatellu-writer-${randomUUID()}`));
  output = join(project.basePath, '.figatellu');
});
afterEach(() => project.cleanup());

describe('createNodeFileWriter', () => {
  it('writes a first generation, creating folders', async () => {
    const writer = createNodeFileWriter(output);
    const result = await writer.commit([generated('locales/index.ts', 'a'), generated('blog/entries/en/x.ts', 'b')]);

    expect(result).toEqual({ ok: true, value: { written: 2, removed: 0, unchanged: 0 }, warnings: [] });
    expect(await project.contents('.figatellu/blog/entries/en/x.ts')).toBe(`${GENERATED_HEADER}\nb\n`);
  });

  it('does not rewrite unchanged files (their modification time is kept)', async () => {
    const writer = createNodeFileWriter(output);

    await writer.commit([generated('a.ts', 'same')]);
    const before = (await stat(join(output, 'a.ts'))).mtimeMs;

    await new Promise((resolve) => setTimeout(resolve, 20));
    const result = await writer.commit([generated('a.ts', 'same')]);

    expect(result.ok && result.value).toEqual({ written: 0, removed: 0, unchanged: 1 });
    expect((await stat(join(output, 'a.ts'))).mtimeMs).toBe(before);
  });

  it('rewrites changed files and removes obsolete generated ones, with their empty folders (no phony file)', async () => {
    const writer = createNodeFileWriter(output);

    await writer.commit([generated('a.ts', '1'), generated('old/entries/x.ts', 'gone')]);
    const result = await writer.commit([generated('a.ts', '2')]);

    expect(result.ok && result.value).toEqual({ written: 1, removed: 1, unchanged: 0 });
    expect(await project.exists('.figatellu/old')).toBe(false);
    expect(await project.contents('.figatellu/a.ts')).toContain('2');
  });

  it('never removes a file it did not generate', async () => {
    await project.create('.figatellu/mine.ts', 'export const userFile = true;\n');
    const result = await createNodeFileWriter(output).commit([generated('a.ts', 'x')]);

    expect(result.ok && result.value.removed).toBe(0);
    expect(await project.exists('.figatellu/mine.ts')).toBe(true);
  });

  it('accepts a stream of files', async () => {
    async function* files() {
      await Promise.resolve();
      yield generated('a.ts', 'a');
      yield generated('b.ts', 'b');
    }
    const result = await createNodeFileWriter(output).commit(files());

    expect(result.ok && result.value.written).toBe(2);
  });

  it('leaves no temporary file behind', async () => {
    await createNodeFileWriter(output).commit([generated('a.ts', 'a')]);
    const entries = await project.readDir('.figatellu');

    expect(entries.map((e) => e.basename)).not.toContainEqual(expect.stringContaining('.tmp'));
  });

  it('rejects a generated path escaping the output folder (broken caller contract)', async () => {
    await expect(createNodeFileWriter(output).commit([generated('../escape.ts', 'x')])).rejects.toThrow(TypeError);
  });
});
