import { describe, expect, it } from 'vitest';

import { sectionOf, type NavigationNode } from '../index.js';

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
