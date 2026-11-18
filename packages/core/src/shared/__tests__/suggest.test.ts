import { describe, expect, it } from 'vitest';

import { damerauLevenshtein, suggest } from '../suggest.js';

describe('damerauLevenshtein', () => {
  it.each([
    ['', '', 0],
    ['abc', '', 3],
    ['kitten', 'sitting', 3],
    ['ab', 'ba', 1], // transposition counts as one edit
    ['fe', 'fr', 1],
    ['de', 'en', 2],
  ])('distance(%j, %j) = %i', (a, b, expected) => {
    expect(damerauLevenshtein(a, b)).toBe(expected);
    expect(damerauLevenshtein(b, a)).toBe(expected);
  });
});

describe('suggest', () => {
  it('keeps only the best distance', () => {
    expect(suggest('fe', ['fr', 'en'])).toEqual(['fr']);
  });

  it('returns ties sorted alphabetically, independently of candidate order', () => {
    expect(suggest('de', ['fr', 'en'])).toEqual(['en', 'fr']);
    expect(suggest('de', ['en', 'fr'])).toEqual(['en', 'fr']);
  });

  it('adds candidates that start with the input, even beyond the distance threshold', () => {
    expect(suggest('dash', ['dashboard', 'discord-bot'])).toEqual(['dashboard']);
  });

  it('returns nothing when no candidate is close enough', () => {
    expect(suggest('drafts', ['fr', 'en'])).toEqual([]);
  });

  it('ignores duplicate candidates', () => {
    expect(suggest('fe', ['fr', 'fr'])).toEqual(['fr']);
  });

  it('does not treat the empty input as a prefix of everything', () => {
    expect(suggest('', ['abcdefgh'])).toEqual([]);
  });
});
