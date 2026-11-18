import { defineLocales } from '@figatellu/core';
import { describe, expect, it } from 'vitest';

import { analyzeMessages, checkNavigationLabels } from '../index.js';

const locales = defineLocales({ list: ['fr', 'en'], default: 'fr' });

const { model } = analyzeMessages({
  locales,
  tree: { content: {}, taxonomies: {} },
  modules: {
    'fr.ts': { nav: { blog: 'Blog', docs: 'Docs' } },
    'en.ts': { nav: { blog: 'Blog', docs: 'Docs' } },
  },
});

describe('checkNavigationLabels', () => {
  it('accepts labels that are messages of the reference locale', () => {
    expect(checkNavigationLabels(model, [{ collection: 'pages', depth: 0, label: 'nav.blog' }], 'fr')).toEqual([]);
    expect(checkNavigationLabels(model, [{ collection: 'pages', depth: 0 }], 'fr')).toEqual([]);
  });

  it('reports an unknown label in the default locale’s module, with suggestions', () => {
    expect(checkNavigationLabels(model, [{ collection: 'pages', depth: 0, label: 'nav.blgo' }], 'fr')).toEqual([
      {
        code: 'unknown-navigation-label',
        severity: 'error',
        file: 'fr.ts',
        key: 'nav.blgo',
        data: { collection: 'pages' },
        suggestions: ['nav.blog'],
      },
    ]);
  });

  it('a group is not a label: it must lead to a message', () => {
    expect(checkNavigationLabels(model, [{ collection: 'pages', depth: 0, label: 'nav' }], 'fr')).toHaveLength(1);
  });
});
