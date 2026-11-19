import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createSearch, type SearchPage } from '@figatellultimate/search';
import { FileSystem } from '@japa/file-system';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { indexSite, type SearchPage as BuiltPage } from '../index.js';

/**
 * The bundles `indexSite` writes, searched through Pagefind's own browser module (`pagefind.js`) and figatellultimate's
 * client, in Node: `fetch` is shimmed to read `file:` URLs, the way a browser fetches the bundle's fragments.
 */
const folder = new FileSystem(join(import.meta.dirname, '..', '..', '.tmp', randomUUID()));
const out = join(folder.basePath, 'pagefind');
const realFetch = globalThis.fetch;

const built = (url: string, locale: string, collection: string, text: string): BuiltPage => ({
  url,
  locale,
  collection,
  html: `<html><head><title>${url}</title></head><body><main data-pagefind-body><p>${text}</p></main></body></html>`,
});

type Collection = 'blog' | 'pages';
const searchIn = (locale: string) =>
  createSearch<Collection>({
    collections: ['blog', 'pages'],
    locale,
    base: pathToFileURL(out).href,
    debounce: 0,
    load: (url) => import(url),
  });
const urls = (page: SearchPage<Collection> | null): readonly string[] => (page?.results ?? []).map((r) => r.url).sort();

beforeAll(async () => {
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);

    if (!url.startsWith('file:')) return realFetch(input, init);

    return new Response(await readFile(fileURLToPath(url.split('?')[0] ?? url)));
  };
  const result = await indexSite({
    outputDirectory: out,
    pages: [
      built('/blog/chevaux', 'fr', 'blog', 'Les chevaux galopent dans la prairie.'),
      built('/docs/cheval', 'fr', 'pages', 'Un cheval blanc dans la documentation.'),
      built('/en/blog/horses', 'en', 'blog', 'The horses are running across the meadow.'),
    ],
  });

  expect(result.problems).toEqual([]);
});
afterAll(async () => {
  globalThis.fetch = realFetch;
  await folder.cleanup();
});

describe('the written bundles, searched like a browser would', () => {
  it('a French query finds French entries only, with French stemming (cheval → chevaux)', async () => {
    expect(urls(await searchIn('fr').query('cheval'))).toEqual(['/blog/chevaux', '/docs/cheval']);
    expect(urls(await searchIn('fr').query('horses'))).toEqual([]);
  });

  it('an English query finds English entries only (horse → horses)', async () => {
    expect(urls(await searchIn('en').query('horse'))).toEqual(['/en/blog/horses']);
    expect(urls(await searchIn('en').query('chevaux'))).toEqual([]);
  });

  it('filters by collection, and gives each result its collection', async () => {
    const page = await searchIn('fr').query('cheval', { collections: ['pages'] });

    expect(page?.results).toEqual([expect.objectContaining({ url: '/docs/cheval', collection: 'pages' })]);
  });
});

describe('sorted results', () => {
  const sorted = new FileSystem(join(import.meta.dirname, '..', '..', '.tmp', randomUUID()));
  const sortedOut = join(sorted.basePath, 'pagefind');
  const page = (url: string, title: string, date?: string): BuiltPage => ({
    ...built(url, 'fr', 'blog', `${title} : un cheval dans la prairie.`),
    sort: { title, ...(date === undefined ? {} : { date }) },
  });
  const sortedSearch = createSearch<Collection>({
    collections: ['blog', 'pages'],
    locale: 'fr',
    base: pathToFileURL(sortedOut).href,
    debounce: 0,
    load: (url) => import(url),
  });
  const order = async (options?: Parameters<typeof sortedSearch.query>[1]): Promise<readonly string[]> => {
    const found = await sortedSearch.query('cheval', options);

    return (found?.results ?? []).map((r) => r.url);
  };

  beforeAll(async () => {
    const result = await indexSite({
      outputDirectory: sortedOut,
      pages: [
        page('/zebre', 'Zèbre', '2025-03-01'),
        page('/ecrire', 'Écrire', '2026-01-15'),
        page('/abaque', 'abaque', '2024-07-30'),
        // A page without a date (documentation): last in both date orders.
        page('/docs', 'Documentation'),
      ],
    });

    expect(result.problems).toEqual([]);
  });
  afterAll(() => sorted.cleanup());

  it('by title, case and accents aside: Écrire between abaque and Zèbre', async () => {
    expect(await order({ sort: 'title-asc' })).toEqual(['/abaque', '/docs', '/ecrire', '/zebre']);
    expect(await order({ sort: 'title-desc' })).toEqual(['/zebre', '/ecrire', '/docs', '/abaque']);
  });

  it('by date, newest or oldest first, undated pages last both ways', async () => {
    expect(await order({ sort: 'date-desc' })).toEqual(['/ecrire', '/zebre', '/abaque', '/docs']);
    expect(await order({ sort: 'date-asc' })).toEqual(['/abaque', '/zebre', '/ecrire', '/docs']);
  });

  it('gives each dated result its date, and none to an undated one', async () => {
    const found = await sortedSearch.query('cheval', { sort: 'date-desc' });

    expect(found?.results.map((r) => [r.url, r.date])).toEqual([
      ['/ecrire', '2026-01-15'],
      ['/zebre', '2025-03-01'],
      ['/abaque', '2024-07-30'],
      ['/docs', undefined],
    ]);
  });

  it("relevance is Pagefind's own order, and the default", async () => {
    expect([...(await order({ sort: 'relevance' }))].sort()).toEqual(['/abaque', '/docs', '/ecrire', '/zebre']);
    expect(await order({ sort: 'relevance' })).toEqual(await order());
  });
});
