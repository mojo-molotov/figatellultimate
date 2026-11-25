import type { Diagnostic } from '@figatellultimate/core';
import type { MessageDiagnostic } from '@figatellultimate/messages';
import { describe, expect, it } from 'vitest';

import { countDiagnostics, explain, explainMessage, reportLines } from '../report.js';

const base = { severity: 'error', collection: 'blog', suggestions: [] } as const;
const missingTitle = (sourcePath: string): Diagnostic => ({
  ...base,
  code: 'missing-frontmatter-field',
  sourcePath,
  data: { field: 'title' },
});

describe('report', () => {
  it('explains a diagnostic with where, why and how to fix it', () => {
    expect(
      explain({
        ...base,
        code: 'unknown-locale',
        sourcePath: 'a/b/drafts/x.mdx',
        data: { folder: 'drafts', locales: ['fr', 'en'] },
      }),
    ).toEqual({
      message: 'folder "drafts" is not a declared locale (fr, en)',
      hint: 'move the file out of it; drafts are marked with `draft: true`, not with a folder',
    });
    expect(
      explain({
        ...base,
        code: 'unknown-taxonomy-term',
        sourcePath: 'x.mdx',
        data: { field: 'tags', taxonomy: 'tags', term: 'cell' },
        suggestions: ['cello'],
      }).hint,
    ).toBe('did you mean "cello"?');
  });

  it("explains a page another route's prefix takes: where it is served, by which route, and the two ways out", () => {
    const shadowed = explain({
      ...base,
      collection: 'pages',
      code: 'route-shadowed',
      sourcePath: 'blog/about.mdx',
      data: { url: '/blog/about', route: '', shadowedBy: 'blog' },
    });

    expect(shadowed.message).toBe(
      'this file is served at /blog/about, under the prefix of the "blog" route: that route answers it, and does not know it (a 404)',
    );
    expect(shadowed.hint).toBe(
      'move this file out of "/blog", or give its collection another base; with one route serving every page, set `splitRoutes: false`',
    );
  });

  it('summarizes a problem repeated in many files once, and groups the others by file', () => {
    const diagnostics: Diagnostic[] = [
      missingTitle('a.mdx'),
      missingTitle('b.mdx'),
      missingTitle('c.mdx'),
      { ...base, code: 'index-forbidden', sourcePath: 'cat/index.mdx', data: { under: 'category' } },
      { ...base, code: 'invalid-draft-flag', sourcePath: 'cat/index.mdx', data: { field: 'draft' } },
    ];

    expect(reportLines(diagnostics, { blog: 'content/blog' })).toEqual([
      '✖ 3 files: required frontmatter field "title" is missing  [missing-frontmatter-field]',
      '    → add `title:` to the frontmatter',
      '    · content/blog/a.mdx',
      '    · content/blog/b.mdx',
      '    · content/blog/c.mdx',
      'content/blog/cat/index.mdx',
      '  ✖ index.mdx is not allowed directly under a category  [index-forbidden]',
      '    → give the file a regular name',
      '  ✖ field "draft" must be true or false  [invalid-draft-flag]',
    ]);
    expect(countDiagnostics(diagnostics)).toEqual({ errors: 5, warnings: 0, infos: 0, files: 4 });
  });
});

describe('report: messages', () => {
  const missing = (file: string): MessageDiagnostic => ({
    code: 'missing-message',
    severity: 'error',
    file,
    key: 'content.blog.patch-notes.dashboard',
    data: { expected: 'group' },
    suggestions: [],
  });

  it('marks an info apart from the problems, counted on its own: a folder shows its newest entry’s image', () => {
    const info = (path: string, fallback: 'newest-entry' | 'none'): Diagnostic => ({
      code: 'folder-image-fallback',
      severity: 'info',
      collection: 'blog',
      sourcePath: null,
      data: { path, fallback },
      suggestions: [],
    });
    const diagnostics = [info('maquis/corsicamon', 'newest-entry'), info('news', 'none')];

    expect(reportLines(diagnostics, { blog: 'content/blog' })).toEqual([
      'blog (collection)',
      '  ℹ the folder "maquis/corsicamon" shows its newest entry\'s image: none declared in folderPages.images  [folder-image-fallback]',
      '  ℹ the folder "news" shows no image: none declared in folderPages.images, and its entries have no image field  [folder-image-fallback]',
    ]);
    expect(countDiagnostics(diagnostics)).toEqual({ errors: 0, warnings: 0, infos: 2, files: 1 });
  });

  it('explains message diagnostics, with content-specific advice', () => {
    expect(explainMessage(missing('en.ts'))).toEqual({
      message: '"content.blog.patch-notes.dashboard" is missing (a group of messages)',
      hint: 'the content requires it in every locale: translate the folder or term',
    });
    expect(
      explainMessage({
        code: 'unknown-message',
        severity: 'error',
        file: 'en.ts',
        key: 'home.welcom',
        data: { against: 'reference' },
        suggestions: ['home.welcome'],
      }).hint,
    ).toBe('did you mean "home.welcome"?');
  });

  it('reports message diagnostics next to content ones, located in the messages folder', () => {
    const content: Diagnostic = { ...base, code: 'invalid-draft-flag', sourcePath: 'x.mdx', data: { field: 'draft' } };
    const messages = { diagnostics: [missing('fr.ts'), missing('en.ts'), missing('ar.ts')], directory: 'i18n' };

    expect(reportLines([content], { blog: 'content/blog' }, undefined, messages)).toEqual([
      '✖ 3 files: "content.blog.patch-notes.dashboard" is missing (a group of messages)  [missing-message]',
      '    → the content requires it in every locale: translate the folder or term',
      '    · i18n/fr.ts',
      '    · i18n/en.ts',
      '    · i18n/ar.ts',
      'content/blog/x.mdx',
      '  ✖ field "draft" must be true or false  [invalid-draft-flag]',
    ]);
    expect(countDiagnostics([content], messages.diagnostics)).toEqual({ errors: 4, warnings: 0, infos: 0, files: 4 });
  });
});
