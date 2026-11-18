import { describe, expectTypeOf, it } from 'vitest';

import { createTranslator, type ScopedKeys } from '../index.js';
import { FR } from './register.js';

const t = createTranslator({ locale: 'fr', messages: FR });

describe('createTranslator (types)', () => {
  it('accepts registered keys with their exact ICU arguments', () => {
    expectTypeOf(t('home.posts', { count: 2 })).toEqualTypeOf<string>();
    t('home.title');
    t('home.greeting', { gender: 'anything', name: 3 });
    // @ts-expect-error unknown key
    t('home.titel');
    // @ts-expect-error missing arguments
    t('home.posts');
    // @ts-expect-error count is a number
    t('home.posts', { count: 'two' });
    // @ts-expect-error no argument expected
    t('home.title', { count: 1 });
  });

  it('scopes keys under a namespace, relative to it', () => {
    const blog = createTranslator({ locale: 'en', messages: FR, namespace: 'content.blog.patch-notes' });

    expectTypeOf<ScopedKeys<'content.blog.patch-notes'>>().toEqualTypeOf<'$.title' | 'bot.$.title'>();
    blog('bot.$.title');
    // @ts-expect-error a key outside the scope
    blog('home.title');
    // @ts-expect-error an unknown scope
    createTranslator({ locale: 'fr', messages: FR, namespace: 'content.blg' });
    // @ts-expect-error an undeclared locale
    createTranslator({ locale: 'de', messages: FR });
  });
});
