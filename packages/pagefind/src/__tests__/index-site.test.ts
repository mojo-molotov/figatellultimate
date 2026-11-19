import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { FileSystem } from '@japa/file-system';
import { afterAll, describe, expect, it } from 'vitest';

import { indexableText, indexSite, type SearchPage } from '../index.js';

const folder = new FileSystem(join(import.meta.dirname, '..', '..', '.tmp', randomUUID()));

afterAll(() => folder.cleanup());

const page = (
  url: string,
  locale: string,
  collection: string,
  title: string,
  text: string,
  body = true,
): SearchPage => ({
  url,
  locale,
  collection,
  html: `<html><head><title>${title}</title></head><body><nav>Menu Accueil Home</nav><main${body ? ' data-pagefind-body' : ''}><h1>${title}</h1><p>${text}</p></main></body></html>`,
});

describe('indexSite, with the real Pagefind', () => {
  it('writes one bundle per locale, with its language and only its pages', async () => {
    const out = join(folder.basePath, 'pagefind');
    const result = await indexSite({
      outputDirectory: out,
      pages: [
        page('/docs/setup', 'fr', 'pages', 'Installation', 'Les billets du blog parlent de robots.'),
        page('/blog/a', 'fr', 'blog', 'Le bot', 'Un billet sur le robot.'),
        page('/en/docs/setup', 'en', 'pages', 'Setup', 'Blog posts talk about robots.'),
      ],
    });

    expect(result.problems).toEqual([]);
    expect(result.locales['fr']?.pages).toBe(2);
    expect(result.locales['en']?.pages).toBe(1);
    const fr: unknown = JSON.parse(await folder.contents('pagefind/fr/pagefind-entry.json'));
    const en: unknown = JSON.parse(await folder.contents('pagefind/en/pagefind-entry.json'));

    // One language per bundle: `languages` holds that locale only.
    expect(fr).toMatchObject({ languages: { fr: { page_count: 2 } } });
    expect(fr).not.toHaveProperty(['languages', 'en']);
    expect(en).toMatchObject({ languages: { en: { page_count: 1 } } });
    expect(en).not.toHaveProperty(['languages', 'fr']);
    expect(await folder.exists('pagefind/fr/pagefind.js')).toBe(true);
    // The collection filter is indexed.
    const filters = (await folder.readDir('pagefind/fr'))
      .map((entry) => entry.path)
      .filter((path) => path.includes('filter'));

    expect(filters.length).toBeGreaterThan(0);
  }, 60_000);

  it('every bundle is complete once it returns, the last locale too: Pagefind, closed once done, never cuts a write short', async () => {
    // Pagefind once answered before its last files reached the disk, and closing it then left them empty
    // (about one indexing in a hundred and fifty, four pages a locale): a timing race, so the indexing is repeated
    // two hundred times, which catches it about three runs in four.
    const pages = [0, 1, 2, 3].flatMap((n) => [
      page(
        `/docs/${String(n)}`,
        'fr',
        'pages',
        `Guide ${String(n)}`,
        `Les chevaux galopent dans la prairie ${String(n)}.`,
      ),
      page(
        `/en/docs/${String(n)}`,
        'en',
        'pages',
        `Guide ${String(n)}`,
        `The horses run across the meadow ${String(n)}.`,
      ),
    ]);

    for (let run = 0; run < 200; run++) {
      const result = await indexSite({ outputDirectory: join(folder.basePath, 'race', String(run)), pages });

      expect(result.problems).toEqual([]);

      for (const locale of ['en', 'fr']) {
        const entry: unknown = JSON.parse(await folder.contents(`race/${String(run)}/${locale}/pagefind-entry.json`));

        expect(entry).toHaveProperty(['languages', locale]);
      }
    }
  }, 120_000);

  it('reports a page without data-pagefind-body instead of indexing its navigation (the safety net of static generation)', async () => {
    const result = await indexSite({
      outputDirectory: join(folder.basePath, 'unmarked'),
      pages: [
        page('/ok', 'fr', 'pages', 'Bien', 'Du contenu.'),
        page('/unmarked', 'fr', 'pages', 'Sans corps', 'Du contenu.', false),
        page('/empty', 'fr', 'pages', '', ''),
      ],
    });

    expect(result.problems.map((p) => [p.code, p.url])).toEqual([
      ['empty-search-content', '/unmarked'],
      ['empty-search-content', '/empty'],
    ]);
    expect(result.locales['fr']?.pages).toBe(1);
  }, 60_000);
});

describe('indexableText', () => {
  it('reads the marked element only, nested tags balanced, scripts and styles removed', () => {
    const html =
      '<html><body><nav>Menu</nav><main data-pagefind-body><div>Un <b>billet</b></div><div>sur <i>le bot</i></div><script>var x = 1;</script></main><footer>Pied</footer></body></html>';

    expect(indexableText(html)).toBe('Un billet sur le bot');
  });

  it('is undefined without a marked element, and empty for an empty one', () => {
    expect(indexableText('<html><body><main>Texte</main></body></html>')).toBeUndefined();
    expect(indexableText('<html><body><main data-pagefind-body><h1></h1></main></body></html>')).toBe('');
  });
});
