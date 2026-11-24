import { describe, expect, it, vi } from 'vitest';

import { compileWithHeadings, type CacheFn } from '../mdx.js';

const DOCUMENT = { content: '# Bonjour', _meta: { path: 'bonjour' } };

/** A cache as Content Collections keeps it: by key and input, computed once. */
function memoryCache(): { readonly cache: CacheFn; readonly keys: string[] } {
  const known = new Map<string, unknown>();
  const keys: string[] = [];
  const cache: CacheFn = async (input, compute, options) => {
    const id = `${options?.key ?? ''} ${JSON.stringify(input)}`;

    keys.push(options?.key ?? '');

    if (!known.has(id)) known.set(id, await compute(input));

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a test cache gives back what it stored.
    return known.get(id) as never;
  };

  return { cache, keys };
}

/** A compiler running the headings plugin over a tree with one heading, as `compileMDX` would. */
const compiler = vi.fn(
  async (
    passThrough: { readonly cache: CacheFn },
    [plugin, options]: Parameters<Parameters<typeof compileWithHeadings>[2]>[1],
  ) => {
    // What `compileMDX` does with its context: caches its code by content.
    return passThrough.cache('content', () => {
      plugin(options)({
        type: 'root',
        children: [{ type: 'element', tagName: 'h1', children: [{ type: 'text', value: 'Bonjour' }] }],
      });

      return 'compiled code';
    });
  },
);

describe('compileWithHeadings', () => {
  it('compiles the code and its headings in one pass', async () => {
    const { cache } = memoryCache();

    expect(await compileWithHeadings({ cache }, DOCUMENT, compiler)).toEqual({
      mdx: 'compiled code',
      headings: [{ id: 'bonjour', text: 'Bonjour', depth: 1 }],
    });
  });

  it('caches both together under its own key: a cached document keeps its headings, never compiled again', async () => {
    const { cache, keys } = memoryCache();

    compiler.mockClear();
    await compileWithHeadings({ cache }, DOCUMENT, compiler);
    const again = await compileWithHeadings({ cache }, DOCUMENT, compiler);

    expect(again.headings).toEqual([{ id: 'bonjour', text: 'Bonjour', depth: 1 }]);
    expect(compiler).toHaveBeenCalledTimes(1);
    // The compiler's own cache passes through: only the document's entry is kept.
    expect(keys).toEqual(['__figatellultimate_mdx', '__figatellultimate_mdx']);
  });
});
