import { describe, expect, it } from 'vitest';

import { neighboursOf, type NavigationNode } from '../index.js';

const entry = (url: string, title: string): NavigationNode => ({ kind: 'entry', url, title, key: url.slice(1) });

const ITEMS: readonly NavigationNode[] = [
  entry('/', 'Accueil'),
  {
    kind: 'section',
    label: 'content.pages.docs.$.title',
    url: '/docs',
    children: [
      entry('/docs/quick-start', 'Démarrage rapide'),
      entry('/docs/installation', 'Installation'),
      {
        kind: 'section',
        label: 'content.pages.docs.deep.$.title',
        url: '/docs/deep',
        children: [entry('/docs/deep/inner', 'Au fond')],
      },
      entry('/docs/configuration', 'Configuration'),
    ],
  },
];

describe('neighboursOf', () => {
  it('gives the entries around a page in its section, in the navigation order, subsections skipped', () => {
    expect(neighboursOf(ITEMS, '/docs/installation')).toEqual({
      previous: { url: '/docs/quick-start', title: 'Démarrage rapide' },
      next: { url: '/docs/configuration', title: 'Configuration' },
    });
  });

  it('gives nothing past either end, nor a neighbour from another section', () => {
    expect(neighboursOf(ITEMS, '/docs/quick-start')).toEqual({
      previous: undefined,
      next: { url: '/docs/installation', title: 'Installation' },
    });
    expect(neighboursOf(ITEMS, '/docs/configuration').next).toBeUndefined();
    expect(neighboursOf(ITEMS, '/docs/deep/inner')).toEqual({ previous: undefined, next: undefined });
  });

  it('gives nothing for a page the navigation does not list', () => {
    expect(neighboursOf(ITEMS, '/elsewhere')).toEqual({ previous: undefined, next: undefined });
  });
});
