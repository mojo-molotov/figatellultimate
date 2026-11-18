import { describe, expect, it } from 'vitest';

import { createTranslator } from '../index.js';
import { FR } from './register.js';

const options = { locale: 'fr', messages: FR, timeZone: 'UTC' } as const;

describe('createTranslator', () => {
  it('formats with use-intl: plurals, selects and dates of the locale', () => {
    const t = createTranslator(options);

    expect(t('home.posts', { count: 1 })).toBe('1 billet');
    expect(t('home.posts', { count: 3 })).toBe('3 billets');
    expect(t('home.greeting', { gender: 'female', name: 'Ada' })).toBe('Bienvenue Ada');
    expect(t('home.greeting', { gender: 'other', name: 2 })).toBe('Bienvenu 2');
    expect(t('home.updated', { day: Date.UTC(2026, 10, 12) })).toBe('Mis à jour le 12 novembre 2026');
    expect(t('content.blog.patch-notes.$.title')).toBe('Notes de version');
  });

  it('scopes keys to a namespace, relative to it', () => {
    const blog = createTranslator({ ...options, namespace: 'content.blog.patch-notes' });

    expect(blog('$.title')).toBe('Notes de version');
    expect(blog('bot.$.title')).toBe('Bot');
  });

  it('tells whether a key exists', () => {
    const t = createTranslator({ ...options, namespace: 'home' });

    expect(t.has('title')).toBe(true);
    // @ts-expect-error -- a key the types reject, checked at runtime (messages loaded from elsewhere).
    expect(t.has('nope')).toBe(false);
  });
});
