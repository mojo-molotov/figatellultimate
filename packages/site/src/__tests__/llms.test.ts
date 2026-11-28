import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { exposedPagesOf, isLlmsExposed, llmsFullOf, llmsTxtOf, markdownUrlOf } from '../index.js';

const site = { origin: 'https://example.dev', defaultLocale: 'fr' };

describe('markdownUrlOf', () => {
  it.each([
    ['a page', '/docs/installation', '/docs/installation.md'],
    ['the home', '/', '/index.md'],
    ['a URL ending with a slash', '/docs/', '/docs/index.md'],
    ['an absolute URL', 'https://example.dev/en/docs/cli', 'https://example.dev/en/docs/cli.md'],
  ])('gives %s its Markdown version, as llms.txt asks', (_, url, markdown) => {
    expect(markdownUrlOf(url)).toBe(markdown);
  });
});

describe('llmsTxtOf', () => {
  it('writes the H1, the summary, the details, the file lists and the optional ones, in the order the spec gives', () => {
    expect(
      llmsTxtOf({
        title: 'figatellultimate',
        summary: 'Du contenu MDX typé.',
        details: ['Les pages sont en Markdown.', 'Une par lien.'],
        sections: [
          {
            title: 'Documentation',
            links: [
              { title: 'Installation', url: '/docs/installation.md', notes: 'Ajouter les paquets.' },
              { title: 'CLI', url: '/docs/cli.md' },
            ],
          },
        ],
        optional: [{ title: 'Le blog', url: 'https://blog.example.dev/' }],
        site,
      }),
    ).toBe(
      [
        '# figatellultimate',
        '',
        '> Du contenu MDX typé.',
        '',
        'Les pages sont en Markdown.',
        '',
        'Une par lien.',
        '',
        '## Documentation',
        '',
        '- [Installation](https://example.dev/docs/installation.md): Ajouter les paquets.',
        '- [CLI](https://example.dev/docs/cli.md)',
        '',
        '## Optional',
        '',
        '- [Le blog](https://blog.example.dev/)',
        '',
      ].join('\n'),
    );
  });

  it('writes the H1 alone when nothing else is given: the only part the spec requires', () => {
    expect(llmsTxtOf({ title: 'figatellultimate', sections: [], site })).toBe('# figatellultimate\n');
  });

  it('throws on a blank title: the H1, the one part the spec requires, would say nothing', () => {
    expect(() => llmsTxtOf({ title: ' \n', sections: [], site })).toThrow(/title/);
  });

  it('reads with plain spaces, a machine reading it, whatever the typography of its texts', () => {
    const written = llmsTxtOf({
      title: 'Doc\u202f!',
      summary: 'Résumé\u00a0: court.',
      sections: [{ title: 'Pages', links: [{ title: 'Où\u202f?', url: '/a.md', notes: 'Note\u00a0: là.' }] }],
      site,
    });

    expect(written).not.toMatch(/[\u00a0\u202f]/);
    expect(written).toContain('- [Où ?](https://example.dev/a.md): Note : là.');
  });

  // The spec's grammar, line by line: an H1 first, then a summary, free text without headings, H2 file lists.
  const SPEC = [
    /^# \S.*$/,
    /^> \S.*$/,
    /^## \S.*$/,
    /^- \[(?:[^\\\]\n]|\\.)+\]\(\S+\)(?:: \S.*)?$/,
    /^(?!#|> |- \[)\S.*$/,
    /^$/,
  ];
  const line = fc.string({ unit: 'grapheme', minLength: 1, maxLength: 30 });
  // A title says something: a blank one throws (below).
  const named = line.filter((text) => text.trim() !== '');

  it('writes what the spec allows, whatever the titles, notes and texts hold (brackets, newlines, hashes)', () => {
    fc.assert(
      fc.property(
        named,
        fc.option(line, { nil: undefined }),
        fc.array(line, { maxLength: 3 }),
        fc.array(
          fc.record({
            title: named,
            links: fc.array(
              fc.record({
                title: line,
                url: fc.constantFrom('/a.md', '/b c.md'),
                notes: fc.option(line, { nil: undefined }),
              }),
              { maxLength: 3 },
            ),
          }),
          { maxLength: 3 },
        ),
        (title, summary, details, sections) => {
          const lines = llmsTxtOf({ title, summary, details, sections, site }).split('\n');

          // Precondition: the title gives a heading, whatever blank it holds.
          expect(lines[0]).toMatch(/^# /);

          for (const written of lines) expect(SPEC.some((rule) => rule.test(written))).toBe(true);

          expect(lines.filter((written) => written.startsWith('# '))).toHaveLength(1);
        },
      ),
    );
  });
});

describe('llmsFullOf', () => {
  it('writes the H1 and the summary, then every page after its source, in the given order', () => {
    expect(
      llmsFullOf({
        title: 'figatellultimate',
        summary: 'Toute la documentation\u00a0: une page après l’autre.',
        pages: [
          { url: '/docs/installation.md', markdown: '# Installation\n\nAjoutez la CLI.\n' },
          { url: '/docs/cli.md', markdown: '# CLI\n' },
        ],
        site,
      }),
    ).toBe(
      [
        '# figatellultimate',
        '',
        '> Toute la documentation : une page après l’autre.',
        '',
        '---',
        '',
        'Source: https://example.dev/docs/installation.md',
        '',
        '# Installation',
        '',
        'Ajoutez la CLI.',
        '',
        '---',
        '',
        'Source: https://example.dev/docs/cli.md',
        '',
        '# CLI',
        '',
      ].join('\n'),
    );
  });
});

describe('isLlmsExposed and exposedPagesOf', () => {
  const urls = [
    { url: '/docs/cli', locale: 'fr', collection: 'pages', key: 'docs/cli', alternates: {}, llms: true },
    { url: '/docs/intro', locale: 'fr', collection: 'pages', key: 'docs/intro', alternates: {}, llms: true },
    { url: '/docs/beta', locale: 'fr', collection: 'pages', key: 'docs/beta', alternates: {}, llms: true },
    { url: '/docs', locale: 'fr', collection: 'pages', key: 'docs', alternates: {}, llms: false },
    { url: '/en/docs/cli', locale: 'en', collection: 'pages', key: 'docs/cli', alternates: {}, llms: true },
  ];
  const entries = new Map([
    ['/docs/cli', { url: '/docs/cli', data: { title: 'CLI', desc: 'Commands', order: 2 }, body: '# CLI' }],
    ['/docs/intro', { url: '/docs/intro', data: { title: 'Intro', order: 1 }, body: '# Intro' }],
    ['/docs/beta', { url: '/docs/beta', data: { title: 'Beta' }, body: '# Beta' }],
  ]);

  it('checks whether a URL is exposed to LLMs', () => {
    expect(isLlmsExposed(urls, '/docs/cli')).toBe(true);
    expect(isLlmsExposed(urls, '/docs')).toBe(false);
    expect(isLlmsExposed(urls, '/unknown')).toBe(false);
  });

  it('collects a locale’s exposed pages sorted by order then title, converting Markdown', async () => {
    const pages = await exposedPagesOf({
      urls,
      locale: 'fr',
      find: (url) => {
        const entry = entries.get(url);

        return Promise.resolve(entry === undefined ? undefined : { kind: 'entry', collection: 'pages', entry });
      },
      fields: { pages: { title: 'title', description: 'desc', order: 'order' } },
      toMarkdown: (body) => `${body}\n`,
    });

    expect(pages).toEqual([
      { url: '/docs/intro', title: 'Intro', markdown: '# Intro\n' },
      { url: '/docs/cli', title: 'CLI', description: 'Commands', markdown: '# CLI\n' },
      { url: '/docs/beta', title: 'Beta', markdown: '# Beta\n' },
    ]);
    expect(Object.isFrozen(pages)).toBe(true);
  });
});
