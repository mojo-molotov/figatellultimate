import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { formatPrecompiled } from '../format.js';
import { createTranslator } from '../index.js';
import { precompiled, precompileMessages } from '../precompile.js';
import { FR } from './register.js';

// The oracle: use-intl's own formatting of the source messages (in the environment's time zone, as in a browser).
const t = createTranslator({ locale: 'fr', messages: FR, onError: () => undefined });
const tree = precompileMessages(FR);

describe('precompiled messages', () => {
  it.each([
    ['home.posts', { count: 1 }],
    ['home.posts', { count: 3 }],
    ['home.greeting', { gender: 'female', name: 'Ada' }],
    ['home.greeting', { gender: 'other', name: 2 }],
    ['home.updated', { day: Date.UTC(2026, 10, 12) }],
  ] as const)('format %s as use-intl does', (key, values) => {
    const text = formatPrecompiled(precompiled(tree, key), 'fr', values);

    // Precondition: the message takes its values (the text is not the source).
    expect(text).not.toContain('{');
    expect(text).toBe(t(key, values));
  });

  it('formats a message without arguments', () => {
    expect(formatPrecompiled(precompiled(tree, 'home.title'), 'fr')).toBe('Accueil');
  });

  it('pluralizes every count as use-intl does', () => {
    fc.assert(
      fc.property(fc.nat({ max: 2_000_000 }), (count) => {
        expect(formatPrecompiled(precompiled(tree, 'home.posts'), 'fr', { count })).toBe(t('home.posts', { count }));
      }),
      { examples: [[0], [1], [2], [1_000_000]] },
    );
  });

  it('is plain data: every object has the plain prototype, as React passes it to a client component', () => {
    const objects: object[] = [];
    const walk = (value: unknown): void => {
      if (typeof value !== 'object' || value === null) return;

      if (!Array.isArray(value)) objects.push(value);

      for (const item of Object.values(value)) walk(item);
    };

    walk(tree);
    // Precondition: the compiler builds option objects (plural, select).
    expect(objects.length).toBeGreaterThan(4);
    expect(objects.every((object) => Object.getPrototypeOf(object) === Object.prototype)).toBe(true);
    expect(JSON.parse(JSON.stringify(tree))).toEqual(tree);
  });

  it('carries its key, for the client to type its arguments', () => {
    expect(precompiled(tree, 'home.posts').key).toBe('home.posts');
  });

  it('throws for a key naming a group of messages, not a message', () => {
    // @ts-expect-error a group, not a message
    expect(() => precompiled(tree, 'home')).toThrow('"home" is not a message.');
  });
});
