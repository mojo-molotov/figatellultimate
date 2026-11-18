import { describe, expect, it } from 'vitest';

import { isValidName, sanitizeName } from '../names.js';

describe('isValidName', () => {
  it.each(['index', 'post-01', '0-day', 'a'])('accepts %j', (name) => {
    expect(isValidName(name)).toBe(true);
  });

  it.each(['', '-a', 'Foo', 'page-00 copy', '_title', 'a_b', 'été'])('rejects %j', (name) => {
    expect(isValidName(name)).toBe(false);
  });
});

describe('sanitizeName', () => {
  it.each([
    ['Foo', 'foo'],
    ['page-00 copy', 'page-00-copy'],
    ['_title', 'title'],
    ['a__b--c', 'a-b-c'],
    ['  Hello World! ', 'hello-world'],
  ])('%j → %j', (input, expected) => {
    expect(sanitizeName(input)).toBe(expected);
    expect(isValidName(sanitizeName(input))).toBe(true);
  });

  it('returns an empty string when nothing can be kept', () => {
    expect(sanitizeName('___')).toBe('');
  });
});
