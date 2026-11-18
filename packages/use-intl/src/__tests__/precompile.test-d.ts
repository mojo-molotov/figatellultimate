import { describe, expectTypeOf, it } from 'vitest';

import { formatPrecompiled } from '../format.js';
import { precompiled, precompileMessages, type Precompiled } from '../precompile.js';
import { FR } from './register.js';

const tree = precompileMessages(FR);

describe('precompiled messages (types)', () => {
  it('carries the key, which types the arguments of the formatting', () => {
    const posts = precompiled(tree, 'home.posts');

    expectTypeOf(posts).toEqualTypeOf<Precompiled<'home.posts'>>();
    expectTypeOf(formatPrecompiled(posts, 'fr', { count: 2 })).toEqualTypeOf<string>();
    // @ts-expect-error missing arguments
    formatPrecompiled(posts, 'fr');
    // @ts-expect-error count is a number
    formatPrecompiled(posts, 'fr', { count: 'two' });
    // @ts-expect-error no argument expected
    formatPrecompiled(precompiled(tree, 'home.title'), 'fr', { count: 1 });
    // @ts-expect-error unknown key
    precompiled(tree, 'home.titel');
  });
});
