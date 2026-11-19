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
};

/** The cells of each row of a rendered index, as text; a cell's lines joined by `|`. */
const rowsOf = (html: string): string[][] =>
  [...html.matchAll(/<tr>\n([\s\S]*?)\n<\/tr>/g)].map((m) =>
    [...(m[1] ?? '').matchAll(/<td>([\s\S]*?)<\/td>/g)].map((cell) =>
      (cell[1] ?? '')
        .replace(/<span class="sr">[^<]*<\/span>/g, '')
        .replace(/<\/span><span/g, '</span>|<span')
        .replace(/<[^>]+>/g, '')
        .trim(),
    ),
  );

describe('allureMeta', () => {
  it("reads a report's counts by kind from its summary, with the commit, the run and the frequency", () => {
    expect(
      allureMeta({
        family: 'ci',
        title: 'CI',
        frequency: 'push',
        summary: { stats: { total: 10, passed: 7, failed: 1, broken: 1, skipped: 1 }, status: 'failed' },
        env: ENV,
        now: NOW,
      }),
    ).toEqual({
      family: 'ci',
      title: 'CI',
      frequency: 'push',
      published: '2026-11-19T06:12:34.000Z',
      counts: { passed: 7, failed: 1, broken: 1, skipped: 1 },
      commit: { sha: '3342e8c', url: 'https://github.com/owner/repo/commit/3342e8cc9a1b2c3d4e5f' },
      run: { number: '17', url: 'https://github.com/owner/repo/actions/runs/44468643214' },
    });
  });

  it('leaves out the kinds it has none of, and has no commit nor run outside GitHub Actions', () => {
    const meta = allureMeta({ family: 'lab', title: 'Lab', summary: { stats: { passed: 45 } }, env: {}, now: NOW });

    expect(meta.counts).toEqual({ passed: 45 });
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

  it.each<[string, readonly string[], object]>([
    ['every budget within', ['✓', '✓', '✓'], { passed: 3 }],
    ['a budget over', ['✓', '✖', '✓'], { passed: 2, failed: 1 }],
  ])("counts the load test's budgets: %s", (_, marks, counts) => {
    expect(
      markdownMeta({ family: 'load', title: 'Load', markdown: budgets(marks), env: ENV, now: NOW }).counts,
    ).toEqual(counts);
  });
});

describe('metaOf', () => {
  it('reads a recorded file field by field, dropping what is not of its shape', () => {
    expect(
      metaOf({ title: 'CI', frequency: 3, counts: { passed: 5, failed: 'x' }, commit: { sha: 'abc' } }, 'ci'),
    ).toEqual({
      family: 'ci',
      title: 'CI',
      frequency: undefined,
      published: undefined,
      counts: { passed: 5 },
      commit: undefined,
      run: undefined,
    });
    expect(metaOf({ counts: { passed: 1 } }, 'ci')).toBeUndefined();
    expect(metaOf('not an object', 'ci')).toBeUndefined();
  });

  it('reads the results an earlier publication phrased as counts, so that its row stays filled', () => {
    expect(metaOf({ title: 'CI', results: '8566 passed, 2 failed, 1 skipped' }, 'ci')?.counts).toEqual({
      passed: 8566,
      failed: 2,
      skipped: 1,
    });
  });
});

describe('renderIndex', () => {
  const REPORTS: readonly ReportMeta[] = [
    {
      family: 'watch-lab',
      title: 'Watch lab',
      frequency: 'weekly',
      published: '2026-11-19T06:35:00.000Z',
      counts: { passed: 45 },
      commit: { sha: 'abc1234', url: 'https://github.com/o/r/commit/abc1234' },
      run: { number: '3', url: 'https://github.com/o/r/actions/runs/3' },
    },
    // Published before metadata existed: its name alone.
    { family: 'browsers', title: 'Real browsers' },
    {
      family: 'ci',
      title: 'CI',
      frequency: 'push',
      published: '2026-11-19T06:12:34.000Z',
      counts: { passed: 7, failed: 2, skipped: 1 },
    },
  ];

  it('lists every family by name: its date, a line per kind of result, its commit, its run and its frequency', () => {
    const html = renderIndex(REPORTS);

    expect(html).toContain('<h1>Index of /figatellultimate/</h1>');
    expect(html).toContain(
      '<th>Name</th><th>Last modified</th><th>Results</th><th>Commit</th><th>Run</th><th>Frequency</th>',
    );
    expect(rowsOf(html)).toEqual([
      ['browsers/', '-', '-', '-', '-', '-'],
      ['ci/', '2026-11-19 06:12 UTC', '7|2|1', '-', '-', 'push'],
      ['watch-lab/', '2026-11-19 06:35 UTC', '45', 'abc1234', '#3', 'weekly'],
    ]);
  });

  it('shows each kind as its colored dot and number only, its word kept for screen readers and as a tooltip', () => {
    const html = renderIndex(REPORTS);

    expect(html).toContain('<span class="count failed" title="2 failed">2<span class="sr"> failed</span></span>');
    // What is shown: the table's body, without the words kept for screen readers, the tooltips and the classes.
    const shown = (/<tbody>([\s\S]*)<\/tbody>/.exec(html)?.[1] ?? '').replace(
      /<span class="sr">[^<]*<\/span>|title="[^"]*"|class="[^"]*"/g,
      '',
    );

    // Precondition: the body was found.
    expect(shown).toContain('45');
    expect(shown).not.toMatch(/passed|failed|skipped/);
  });

  it("ends with the reports' name, and Bonaparte's approval", () => {
    expect(renderIndex(REPORTS)).toContain('<address>figatellultimate test reports · Bonaparte approves</address>');
  });

  it('escapes every text it writes', () => {
    const html = renderIndex([{ family: 'x"><script>', title: 't', frequency: '<b>&</b>' }]);

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
