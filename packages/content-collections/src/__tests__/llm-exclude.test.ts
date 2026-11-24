import { describe, expect, it } from 'vitest';

import { rehypeLlmExclude, type LlmExcludeNode } from '../llm-exclude.js';

const text = (value: string): LlmExcludeNode => ({ type: 'text', value });
const element = (tagName: string, children: LlmExcludeNode[]): LlmExcludeNode => ({
  type: 'element',
  tagName,
  children,
});
/** An MDX JSX element, as the compilation keeps it in the tree: a block (flow) or within a line (text). */
const jsx = (type: 'mdxJsxFlowElement' | 'mdxJsxTextElement', name: string, children: LlmExcludeNode[]) => ({
  type,
  name,
  children,
});
/** The tree as tags and texts: what a reader of the HTML sees. */
const shape = (node: LlmExcludeNode): unknown =>
  node.type === 'text' ? node.value : { [node.tagName ?? node.name ?? node.type]: (node.children ?? []).map(shape) };

describe('rehypeLlmExclude', () => {
  it('shows what <llm-exclude> holds, without the tag, as a block or within a line, nested in any element', () => {
    const tree: LlmExcludeNode = {
      type: 'root',
      children: [
        jsx('mdxJsxFlowElement', 'llm-exclude', [element('p', [text('Pour les humains.')])]),
        element('div', [
          element('p', [
            text('Ajoutez la CLI'),
            jsx('mdxJsxTextElement', 'llm-exclude', [text(' (copiée)')]),
            text('.'),
          ]),
        ]),
      ],
    };

    rehypeLlmExclude()(tree);

    expect(shape(tree)).toEqual({
      root: [{ p: ['Pour les humains.'] }, { div: [{ p: ['Ajoutez la CLI', ' (copiée)', '.'] }] }],
    });
  });

  it('leaves any other JSX element as it is', () => {
    const tree: LlmExcludeNode = {
      type: 'root',
      children: [jsx('mdxJsxFlowElement', 'Note', [element('p', [text('Gardée.')])])],
    };

    rehypeLlmExclude()(tree);

    expect(shape(tree)).toEqual({ root: [{ Note: [{ p: ['Gardée.'] }] }] });
  });
});
