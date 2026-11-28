import { describe, expect, it } from 'vitest';

import { pagedSectionsOf, sectionOf, splitSectionBatches, type NavigationNode } from '../index.js';

const ITEMS: readonly NavigationNode[] = [
  { kind: 'entry', url: '/', title: 'Accueil', key: '' },
  {
    kind: 'section',
    label: 'content.pages.docs.$.title',
    url: '/docs',
    children: [
      { kind: 'entry', url: '/docs/setup', title: 'Installation', key: 'docs/setup' },
      {
        kind: 'section',
        label: 'content.pages.docs.deep.$.title',
        url: '/docs/deep',
        children: [{ kind: 'entry', url: '/docs/deep/inner', title: 'Au fond', key: 'docs/deep/inner' }],
      },
    ],
  },
  { kind: 'section', label: 'content.pages.guides.$.title', children: [] },
];

describe('sectionOf', () => {
  it('gives the section a page opens, at any depth, with its children', () => {
    expect(sectionOf(ITEMS, '/docs')?.children.map((node) => node.url)).toEqual(['/docs/setup', '/docs/deep']);
    expect(sectionOf(ITEMS, '/docs/deep')?.children.map((node) => node.url)).toEqual(['/docs/deep/inner']);
  });

  it('gives nothing for an entry, a section without a page, or an unknown URL', () => {
    expect(sectionOf(ITEMS, '/docs/setup')).toBeUndefined();
    expect(sectionOf(ITEMS, '/')).toBeUndefined();
    expect(sectionOf(ITEMS, '/nope')).toBeUndefined();
    expect(sectionOf([...ITEMS, { kind: 'entry', url: '/guides', title: 'Guides', key: 'guides' }], '/guides')).toBe(
      undefined,
    );
  });
});

describe('splitSectionBatches', () => {
  it('groups cards by batchSize while keeping non-card headings with the following card', () => {
    const items = [
      { id: 'c1', card: true },
      { id: 'c2', card: true },
      { id: 'h1', card: false },
      { id: 'c3', card: true },
      { id: 'c4', card: true },
      { id: 'c5', card: true },
    ];
    const batches = splitSectionBatches(items, 2);

    expect(batches.map((batch) => batch.map((item) => item.id))).toEqual([['c1', 'c2', 'h1'], ['c3', 'c4'], ['c5']]);
    expect(Object.isFrozen(batches)).toBe(true);
    expect(batches.every((batch) => Object.isFrozen(batch))).toBe(true);
  });

  it('rejects non-positive or non-integer batch sizes', () => {
    expect(() => splitSectionBatches([], 0)).toThrow(/positive integer/);
    expect(() => splitSectionBatches([], 1.5)).toThrow(/positive integer/);
  });
});

describe('pagedSectionsOf', () => {
  it('finds every section whose direct linked children exceed one batch', () => {
    const tree: readonly NavigationNode[] = [
      {
        kind: 'section',
        label: 'docs',
        url: '/docs',
        children: [
          { kind: 'entry', url: '/docs/a', title: 'A', key: 'docs/a' },
          { kind: 'entry', url: '/docs/b', title: 'B', key: 'docs/b' },
          { kind: 'section', label: 'heading-only', children: [] },
          { kind: 'entry', url: '/docs/c', title: 'C', key: 'docs/c' },
        ],
      },
      {
        kind: 'section',
        label: 'small',
        url: '/small',
        children: [{ kind: 'entry', url: '/small/a', title: 'A', key: 'small/a' }],
      },
    ];

    expect(pagedSectionsOf(tree, 2)).toEqual([{ url: '/docs', batches: 2 }]);
    expect(pagedSectionsOf(tree, 4)).toEqual([]);
  });
});
