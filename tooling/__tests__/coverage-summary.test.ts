import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { coverageMarkdown } from '../coverage-summary.ts';

const ROOT = join('/', 'work', 'repo');

/** Istanbul's counts for one file or the total. */
const counts = (covered: number, total: number) => {
  const metric = { total, covered, skipped: 0, pct: total === 0 ? 100 : Math.round((covered / total) * 10000) / 100 };

  return { lines: metric, statements: metric, functions: metric, branches: metric };
};

/** A `coverage-summary.json`: two files of core, one of facets. */
const SUMMARY = {
  total: counts(25, 40),
  [join(ROOT, 'packages', 'core', 'src', 'a.ts')]: counts(8, 10),
  [join(ROOT, 'packages', 'core', 'src', 'paths', 'b.ts')]: counts(2, 10),
  [join(ROOT, 'packages', 'facets', 'src', 'engine.ts')]: counts(15, 20),
};

describe('coverageMarkdown', () => {
  it('sums each package over its files, sorted by name, then the total', () => {
    const result = coverageMarkdown(SUMMARY, ROOT, 'https://example.org/ci/coverage/');

    expect(result.ok).toBe(true);

    if (!result.ok) return;

    const rows = result.value.split('\n').filter((line) => line.startsWith('| '));

    expect(rows).toEqual([
      '| Package | Lines | Branches | Functions | Statements |',
      '| --- | --- | --- | --- | --- |',
      '| `@figatellultimate/core` | 50.00% (10/20) | 50.00% (10/20) | 50.00% (10/20) | 50.00% (10/20) |',
      '| `@figatellultimate/facets` | 75.00% (15/20) | 75.00% (15/20) | 75.00% (15/20) | 75.00% (15/20) |',
      '| **Total** | **62.50% (25/40)** | **62.50% (25/40)** | **62.50% (25/40)** | **62.50% (25/40)** |',
    ]);
    expect(result.value).toContain('[The full report](https://example.org/ci/coverage/)');
    expect(result.value).toContain('Measured on the pure packages only.');
  });

  it('writes an empty metric as a dash, never as a percentage of nothing', () => {
    const result = coverageMarkdown(
      { total: counts(0, 0), [join(ROOT, 'packages', 'toc', 'src', 'i.ts')]: counts(0, 0) },
      ROOT,
    );

    expect(result.ok && result.value).toContain('| `@figatellultimate/toc` | – | – | – | – |');
  });

  it.each([
    ['not an object', 'nope'],
    ['no total', {}],
    ['a file without its metrics', { total: counts(1, 1), [join(ROOT, 'packages', 'core', 'src', 'a.ts')]: {} }],
  ])('refuses a summary that is %s, saying what it expected', (_, summary) => {
    const result = coverageMarkdown(summary, ROOT);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('coverage-summary.json');
  });
});
