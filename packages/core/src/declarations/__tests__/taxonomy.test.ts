import { describe, expect, it } from 'vitest';

import { defineTaxonomy, InvalidTaxonomyError } from '../taxonomy.js';
import { authors, tags } from '../../__tests__/scenarios/collections.js';

describe('defineTaxonomy', () => {
  it('declares terms from a list, without data', () => {
    expect(tags.terms).toEqual(['bagpipes', 'cello', 'xylophone', 'react']);
    expect(tags.data).toBeNull();
  });

  it('declares terms from a record, keeping their pure data', () => {
    expect(authors.terms).toEqual(['Gustave', 'Arnaud']);
    expect(authors.data).toEqual({ Gustave: { avatar: '/a/gustave.png' }, Arnaud: { avatar: '/a/arnaud.png' } });
  });

  it('returns frozen, serializable data', () => {
    expect(Object.isFrozen(authors)).toBe(true);
    expect(Object.isFrozen(authors.terms)).toBe(true);
    expect(JSON.parse(JSON.stringify(authors))).toEqual(authors);
  });

  it.each([
    ['duplicate terms', ['a', 'a']],
    ['an empty term', ['']],
    ['a term with surrounding spaces', [' a']],
    ['an empty taxonomy', []],
  ])('throws InvalidTaxonomyError on %s', (_, terms) => {
    expect(() => defineTaxonomy(terms)).toThrow(InvalidTaxonomyError);
  });
});

describe('defineTaxonomy: required message fields', () => {
  it('keeps the fields every term needs, for both forms, and none by default', () => {
    expect(defineTaxonomy(['bot', 'guide'], { messages: ['label'] }).messages).toEqual(['label']);
    expect(defineTaxonomy({ gustave: { avatar: '/g.jpg' } }, { messages: ['alt', 'bio'] }).messages).toEqual([
      'alt',
      'bio',
    ]);
    expect(defineTaxonomy(['bot']).messages).toEqual([]);
  });

  it.each([[['']], [['$']], [['a.b']], [['label', 'label']]])('throws InvalidTaxonomyError on fields %j', (fields) => {
    expect(() => defineTaxonomy(['bot'], { messages: fields })).toThrow(InvalidTaxonomyError);
  });
});

describe('defineTaxonomy: content', () => {
  it("keeps the collection holding each term's content, none by default", () => {
    expect(defineTaxonomy(['gustave']).content).toBeNull();
    const authors = defineTaxonomy(['gustave'], { pages: { base: 'authors' }, content: 'authorBios' });

    expect(authors.content).toBe('authorBios');
  });

  it.each([
    ['without term pages, where it would show', { content: 'authorBios' }],
    ['naming no collection', { pages: { base: 'authors' }, content: 'author-bios' }],
  ])('throws InvalidTaxonomyError on content %s', (_, options) => {
    expect(() => defineTaxonomy(['gustave'], options)).toThrow(InvalidTaxonomyError);
  });
});
