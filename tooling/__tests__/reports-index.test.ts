import { describe, expect, it } from 'vitest';

import {
  allureMeta,
  markdownMeta,
  metaOf,
  renderIndex,
  renderMarkdownPage,
  type ReportMeta,
} from '../reports-index.ts';

const NOW = new Date('2026-11-19T06:12:34Z');
const ENV = {
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_REPOSITORY: 'owner/repo',
  GITHUB_SHA: '3342e8cc9a1b2c3d4e5f',
  GITHUB_RUN_ID: '44468643214',
  GITHUB_RUN_NUMBER: '17',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_REF_NAME: 'main',
};

/** The rows of a rendered index, as text, one per family. */
const rowsOf = (html: string): string[] =>
  [...html.matchAll(/<tr>\n([\s\S]*?)\n<\/tr>/g)].map((m) =>
    (m[1] ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );

describe('allureMeta', () => {
  it("reads a report's status and counts from its summary, the commit, the run, the coverage and the history", () => {
    expect(
      allureMeta({
        family: 'ci',
        title: 'CI',
        summary: { stats: { total: 10, passed: 7, failed: 1, broken: 1, skipped: 1 }, status: 'failed' },
        history: { runs: 3, limit: 5 },
        coverage: { total: { lines: { pct: 98.815 } } },
        coverageHref: 'ci/coverage/',
        env: ENV,
        now: NOW,
      }),
    ).toEqual({
      family: 'ci',
      title: 'CI',
      published: '2026-11-19T06:12:34.000Z',
      status: 'failed',
      results: '7 passed, 2 failed, 1 skipped',
      commit: { sha: '3342e8c', url: 'https://github.com/owner/repo/commit/3342e8cc9a1b2c3d4e5f' },
      run: { number: '17', url: 'https://github.com/owner/repo/actions/runs/44468643214', event: 'push', ref: 'main' },
      notes: [{ text: 'coverage 98.8%', href: 'ci/coverage/' }, { text: 'history 3/5' }],
    });
  });

  it('passes a report with every test passed, and has no commit nor run outside GitHub Actions', () => {
    const meta = allureMeta({ family: 'lab', title: 'Lab', summary: { stats: { passed: 45 } }, env: {}, now: NOW });

    expect(meta).toMatchObject({ status: 'passed', results: '45 passed', notes: [] });
    expect(meta.commit).toBeUndefined();
    expect(meta.run).toBeUndefined();
  });
});

describe('markdownMeta', () => {
  const budgets = (marks: readonly string[]): string =>
    [
      '## Budgets',
      '',
      '| Budget | Measured | At most | |',
      '|---|---|---|---|',
      ...marks.map((mark, i) => `| b${String(i)} | 1 | 2 | ${mark} |`),
    ].join('\n');

  it.each<[string, readonly string[], string, string]>([
    ['every budget within', ['✓', '✓', '✓'], 'passed', '3 budgets within'],
    ['a budget over', ['✓', '✖', '✓'], 'failed', '1 of 3 budgets over'],
  ])("reads the load test's status from its budgets: %s", (_, marks, status, results) => {
    expect(markdownMeta({ family: 'load', title: 'Load', markdown: budgets(marks), env: ENV, now: NOW })).toMatchObject(
      {
        status,
        results,
      },
    );
  });
});

describe('metaOf', () => {
  it('reads a recorded file field by field, dropping what is not of its shape', () => {
    expect(
      metaOf(
        { title: 'CI', status: 'maybe', results: 5, commit: { sha: 'abc' }, notes: [{ text: 'x' }, { href: 'y' }] },
        'ci',
      ),
    ).toEqual({
      family: 'ci',
      title: 'CI',
      published: undefined,
      status: undefined,
      results: undefined,
      commit: undefined,
      run: undefined,
      notes: [{ text: 'x', href: undefined }],
    });
    expect(metaOf({ results: '1 passed' }, 'ci')).toBeUndefined();
    expect(metaOf('not an object', 'ci')).toBeUndefined();
  });
});

describe('renderIndex', () => {
  const REPORTS: readonly ReportMeta[] = [
    {
      family: 'watch-lab',
      title: 'Watch lab (weekly)',
      published: '2026-11-19T06:35:00.000Z',
      status: 'passed',
      results: '45 passed',
      commit: { sha: 'abc1234', url: 'https://github.com/o/r/commit/abc1234' },
      run: { number: '3', url: 'https://github.com/o/r/actions/runs/3', event: 'workflow_dispatch', ref: 'main' },
      notes: [{ text: 'history 2/5' }],
    },
    // Published before metadata existed: its title alone.
    { family: 'browsers', title: 'Real browsers <weekly>' },
    {
      family: 'ci',
      title: 'CI',
      published: '2026-11-19T06:12:34.000Z',
      status: 'failed',
      results: '7 passed, 2 failed',
    },
  ];

  it("lists every family by name, Apache's columns, the description last with its notes, a dash where it has none", () => {
    const html = renderIndex(REPORTS, 'owner.github.io');

    expect(html).toContain('<h1>Index of /figatellultimate/</h1>');
    expect(rowsOf(html)).toEqual([
      'browsers/ - - - - Real browsers &lt;weekly&gt;',
      'ci/ 2026-11-19 06:12 UTC 7 passed, 2 failed - - CI',
      'watch-lab/ 2026-11-19 06:35 UTC 45 passed abc1234 #3 manual Watch lab (weekly) · history 2/5',
    ]);
    expect(html).toContain('<span class="status failed">7 passed, 2 failed</span>');
    expect(html).toContain('<a href="https://github.com/o/r/actions/runs/3">#3</a>');
    expect(html).toContain('owner.github.io');
  });

  it('escapes every text it writes', () => {
    const html = renderIndex([{ family: 'x"><script>', title: '<b>&</b>', results: '<i>' }], 'h');

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>&</b>');
    expect(html).toContain('&lt;b&gt;&amp;&lt;/b&gt;');
  });
});

describe('renderMarkdownPage', () => {
  it("renders the load test's report: headings, lists, tables, code and bold, escaped, below a parent link", () => {
    const html = renderMarkdownPage(
      'Load test',
      [
        '# Load test: 2500 posts',
        '',
        '## Times',
        '',
        '- next build: 38.4 s',
        '- `.figatellultimate/`: 65 MB',
        '',
        '| Step | total |',
        '|---|---|',
        '| open <a> post | **93.6 kB** |',
      ].join('\n'),
      '../',
    );

    expect(html).toContain('<a href="../">../</a>');
    expect(html).toContain('<h1>Load test: 2500 posts</h1>');
    expect(html).toContain('<h2>Times</h2>');
    expect(html).toContain('<ul><li>next build: 38.4 s</li><li><code>.figatellultimate/</code>: 65 MB</li></ul>');
    expect(html).toContain('<thead><tr><th>Step</th><th>total</th></tr></thead>');
    expect(html).toContain('<td>open &lt;a&gt; post</td><td><strong>93.6 kB</strong></td>');
  });
});
