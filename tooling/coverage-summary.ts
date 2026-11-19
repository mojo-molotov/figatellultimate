/**
 * The coverage as a Markdown table, for the CI job's summary on GitHub: one row per package, then the total, and a
 * link to the full HTML report.
 *
 *     pnpm test:coverage ──> coverage/coverage-summary.json (per file) ──> coverageMarkdown ──> $GITHUB_STEP_SUMMARY
 *
 *     node tooling/coverage-summary.ts <coverage-summary.json> [report URL]   (CI's test job, on one runner)
 *
 * Key design decisions:
 *     - Per package, summed over its files: what a reader looks for; the HTML report has the files.
 *     - Counts beside the percentages, and no grade nor threshold: coverage is a report, never a target.
 *     - Written here rather than by a third-party action: vitest's own summary, read with Node alone, checked by a test.
 *     - The summary is validated before it is read; a broken one is a returned error, printed by the entry point.
 *
 * Invariants (`__tests__/coverage-summary.test.ts`): sums per package and the total; an empty metric is a dash; a
 * malformed summary is refused, saying what was expected.
 */
import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';

const METRICS = ['lines', 'branches', 'functions', 'statements'] as const;

type Metric = (typeof METRICS)[number];

interface Count {
  readonly covered: number;
  readonly total: number;
}

type Counts = Readonly<Record<Metric, Count>>;

/** The table, or why the summary could not be read. */
export type CoverageMarkdown =
  { readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: string };

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

function countsOf(value: unknown): Counts | undefined {
  const counts: Partial<Record<Metric, Count>> = {};

  for (const metric of METRICS) {
    const covered = field(field(value, metric), 'covered');
    const total = field(field(value, metric), 'total');

    if (typeof covered !== 'number' || typeof total !== 'number') return undefined;

    counts[metric] = { covered, total };
  }

  const { lines, branches, functions, statements } = counts;

  return lines && branches && functions && statements ? { lines, branches, functions, statements } : undefined;
}

const add = (a: Counts, b: Counts): Counts => ({
  lines: { covered: a.lines.covered + b.lines.covered, total: a.lines.total + b.lines.total },
  branches: { covered: a.branches.covered + b.branches.covered, total: a.branches.total + b.branches.total },
  functions: { covered: a.functions.covered + b.functions.covered, total: a.functions.total + b.functions.total },
  statements: { covered: a.statements.covered + b.statements.covered, total: a.statements.total + b.statements.total },
});

const cell = ({ covered, total }: Count): string =>
  total === 0 ? '–' : `${((covered / total) * 100).toFixed(2)}% (${String(covered)}/${String(total)})`;

const row = (name: string, counts: Counts, bold = false): string =>
  `| ${name} | ${METRICS.map((metric) => (bold ? `**${cell(counts[metric])}**` : cell(counts[metric]))).join(' | ')} |`;

/**
 * The coverage of a run as Markdown.
 *
 * @param summary - vitest's `coverage-summary.json`, parsed: `total` and one entry per file, by absolute path.
 * @param root - The repository's root, to tell each file's package.
 * @param reportUrl - Where the full HTML report is published, if it is.
 * @returns A heading, the table (a row per package, sorted by name, then the total) and the link; or why the summary
 *   could not be read.
 *
 * @example
 * coverageMarkdown(JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8')), process.cwd());
 */
export function coverageMarkdown(summary: unknown, root: string, reportUrl?: string): CoverageMarkdown {
  const expected =
    'expected vitest\'s coverage-summary.json: a "total" and, per file, lines, branches, functions and statements';
  const total = countsOf(field(summary, 'total'));

  if (typeof summary !== 'object' || summary === null || total === undefined) return { ok: false, error: expected };

  const packages = new Map<string, Counts>();

  for (const [path, value] of Object.entries(summary)) {
    if (path === 'total') continue;

    const counts = countsOf(value);

    if (counts === undefined) return { ok: false, error: `${expected} (${relative(root, path)} has none)` };

    const file = relative(root, path).split(sep).join('/');
    const name = /^packages\/([^/]+)\//.exec(file)?.[1] ?? file;
    const previous = packages.get(name);

    packages.set(name, previous === undefined ? counts : add(previous, counts));
  }

  const rows = [...packages]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, counts]) => row(`\`@figatellultimate/${name}\``, counts));

  return {
    ok: true,
    value: [
      '### Coverage',
      '',
      '| Package | Lines | Branches | Functions | Statements |',
      '| --- | --- | --- | --- | --- |',
      ...rows,
      row('**Total**', total, true),
      '',
      "Measured on the pure packages only. Adapters and React components are tested in real browsers, real processes and the example's build, which measure no coverage.",
      ...(reportUrl === undefined ? [] : ['', `[The full report](${reportUrl})`]),
      '',
    ].join('\n'),
  };
}

if (import.meta.main) {
  const [path = 'coverage/coverage-summary.json', reportUrl] = process.argv.slice(2);
  const result = coverageMarkdown(
    JSON.parse(readFileSync(path, 'utf8')),
    process.cwd(),
    reportUrl === '' ? undefined : reportUrl,
  );

  if (result.ok) process.stdout.write(result.value);
  else {
    process.stderr.write(`${result.error}\n`);
    process.exitCode = 1;
  }
}
