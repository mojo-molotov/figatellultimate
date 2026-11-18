import { describe, expect, it } from 'vitest';

import type { Heading } from '@figatellu/toc';

import { rehypeHeadings, type HastNode } from '../headings.js';

const text = (value: string): HastNode => ({ type: 'text', value });
const el = (tagName: string, children: HastNode[], properties: Record<string, unknown> = {}): HastNode => ({
  type: 'element',
  tagName,
  properties,
  children,
});

describe('rehypeHeadings', () => {
  it('gives every heading a unique id and records the same headings, in document order', () => {
    const tree: HastNode = {
      type: 'root',
      children: [
        el('h1', [text('Votre premier site')]),
        el('h2', [text('Installer '), el('code', [text('figatellu')])]),
        el('p', [text('Du texte.')]),
        el('section', [el('h3', [text('Étape 1 : la config')])]),
        el('h2', [text('Installer figatellu')]),
        el('h2', [text('   ')]),
        el('h2', [text('Déjà nommé')], { id: 'custom' }),
      ],
    };
    const into: Heading[] = [];

    rehypeHeadings({ into })(tree);
    expect(into).toEqual([
      { id: 'votre-premier-site', text: 'Votre premier site', depth: 1 },
      { id: 'installer-figatellu', text: 'Installer figatellu', depth: 2 },
      { id: 'étape-1--la-config', text: 'Étape 1 : la config', depth: 3 },
      // Same text, unique id (as rehype-slug).
      { id: 'installer-figatellu-1', text: 'Installer figatellu', depth: 2 },
      { id: 'custom', text: 'Déjà nommé', depth: 2 },
    ]);
    // The ids in the tree are the recorded ones; the empty heading gets none.
    const ids: unknown[] = [];
    const walk = (node: HastNode): void => {
      if (node.type === 'element' && /^h[1-6]$/.test(node.tagName ?? '')) ids.push(node.properties?.['id']);

      for (const child of node.children ?? []) walk(child);
    };

    walk(tree);
    expect(ids).toEqual([
      'votre-premier-site',
      'installer-figatellu',
      'étape-1--la-config',
      'installer-figatellu-1',
      undefined,
      'custom',
    ]);
  });

  it('starts afresh for every document: the same title gets the same id in two documents', () => {
    const doc = (): HastNode => ({ type: 'root', children: [el('h2', [text('Résumé')])] });
    const first: Heading[] = [];
    const second: Heading[] = [];

    rehypeHeadings({ into: first })(doc());
    rehypeHeadings({ into: second })(doc());
    expect([first[0]?.id, second[0]?.id]).toEqual(['résumé', 'résumé']);
  });
});
