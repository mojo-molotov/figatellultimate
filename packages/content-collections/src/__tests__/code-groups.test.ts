import { describe, expect, it } from 'vitest';

import { rehypeCodeGroups, type CodeGroupNode } from '../code-groups.js';

const text = (value: string): CodeGroupNode => ({ type: 'text', value });
/** A highlighted block as MDX gives it: `<pre><code>` with the fence's meta (```sh pnpm). */
const block = (meta: string | undefined, code: string): CodeGroupNode => ({
  type: 'element',
  tagName: 'pre',
  children: [{ type: 'element', tagName: 'code', data: { meta }, children: [text(code)] }],
});
const p = (value: string): CodeGroupNode => ({ type: 'element', tagName: 'p', children: [text(value)] });
/** The tree after the plugin, as tags and labels: what a reader of the HTML sees. */
const shape = (node: CodeGroupNode): unknown =>
  node.type === 'text'
    ? (node.value ?? '').trim() || undefined
    : node.properties?.['dataCodeGroup'] !== undefined
      ? { group: (node.children ?? []).map((tab) => tab.properties?.['dataLabel']) }
      : node.tagName === 'pre'
        ? 'pre'
        : { [node.tagName ?? node.type]: (node.children ?? []).map(shape).filter((child) => child !== undefined) };
const run = (children: CodeGroupNode[], options?: Parameters<typeof rehypeCodeGroups>[0]): unknown => {
  const tree: CodeGroupNode = { type: 'root', children };

  rehypeCodeGroups(options)(tree);

  return shape(tree);
};

describe('rehypeCodeGroups', () => {
  it('groups consecutive marked blocks, blank lines between them, each tab named by its marker', () => {
    expect(
      run([p('Installer :'), block('npm', 'npm i'), text('\n'), block('pnpm', 'pnpm add'), block('bun', 'bun add')]),
    ).toEqual({ root: [{ p: ['Installer :'] }, { group: ['npm', 'pnpm', 'bun'] }] });
  });

  it.each([
    ['a marked block alone', [block('npm', 'npm i')], { root: ['pre'] }],
    [
      'a block without a marker between two',
      [block('npm', 'a'), block(undefined, 'b'), block('pnpm', 'c')],
      { root: ['pre', 'pre', 'pre'] },
    ],
    [
      'a paragraph between two',
      [block('npm', 'a'), p('ou'), block('pnpm', 'c')],
      { root: ['pre', { p: ['ou'] }, 'pre'] },
    ],
    ['an unknown marker', [block('deno', 'a'), block('npm', 'b')], { root: ['pre', 'pre'] }],
  ])('leaves %s as plain blocks', (_, children, expected) => {
    expect(run(children)).toEqual(expected);
  });

  it('groups inside any element, e.g. a list item', () => {
    expect(run([{ type: 'element', tagName: 'li', children: [block('npm', 'a'), block('yarn', 'b')] }])).toEqual({
      root: [{ li: [{ group: ['npm', 'yarn'] }] }],
    });
  });

  it('takes the markers it is given, each with its tab’s name', () => {
    expect(run([block('ts', 'a'), block('js', 'b')], { labels: { ts: 'TypeScript', js: 'JavaScript' } })).toEqual({
      root: [{ group: ['TypeScript', 'JavaScript'] }],
    });
  });
});
