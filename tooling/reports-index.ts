/**
 * The index of the published test reports (GitHub Pages' root), in the look of a modernized Apache directory
 * listing, and the load test's own page; the metadata each family records when it publishes.
 *
 *     a family publishes ──> its metadata (`_history/<family>.json`: date, counts, coverage, commit, run, frequency)
 *     every publication  ──> renderIndex(every family's metadata) ──> index.html
 *     the load test      ──> renderMarkdownPage(load-report.md) ──> load/index.html
 *
 *     node tooling/reports-index.ts meta --family ci --title … --frequency push --site .allure-reports
 *                                        [--report <allure report> [--coverage <coverage-summary.json>]]
 *                                        [--markdown <report.md>]
 *     node tooling/reports-index.ts index --site .allure-reports
 *     node tooling/reports-index.ts page --markdown load-report.md --title … --out load/index.html
 *
 * Key design decisions:
 *     - Static: written at publication, read from what that publication has (the report's summary, GitHub Actions'
 *       variables). Rejected: the workflows' live state through GitHub's API at each visit, a network call and a
 *       rate limit for a page meant to be plain.
 *     - Each family records its own metadata: a publication only renders its family, so the index reads the others'
 *       from what they recorded; a family's line is as of its last publication. A family without any is listed by
 *       its name alone.
 *     - Apache's listing, modernized and spare: its title, columns and rules, in a fixed-width font with a dark
 *       theme; Name, Last modified, Results, Commit, Run, Frequency. Results are counts by kind, one per line, each
 *       a colored dot and a number (the kind's word kept for screen readers and as a tooltip); the CI's coverage,
 *       its share of lines linked to its report, is the last line of its results (no column for one family); the
 *       run is its number;
 *       the frequency its shortest word (`push`, `weekly`). No size, no notes, no host: what the reader scans for.
 *     - The load test's report is Markdown (its job summary): rendered here for its subset (headings, lists,
 *       tables, code, bold), escaped, in the same look; its counts are its budgets, within and over. Rejected: a
 *       Markdown library for one page.
 *
 * Invariants (`__tests__/reports-index.test.ts`): every text is escaped; families sorted by name; a family without
 * metadata still listed; a report's counts from its summary, the load test's from its budgets; a metadata file
 * read field by field, its older phrased results too.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

/** The kinds of results, in the order they are listed. */
const KINDS = ['passed', 'failed', 'broken', 'skipped'] as const;

/** Results by kind; a kind absent counts none. */
export type Counts = Readonly<Partial<Record<(typeof KINDS)[number], number>>>;

/** What a family records when it publishes. */
export interface ReportMeta {
  readonly family: string;
  readonly title: string;
  /** How often it runs, in a word: `push`, `weekly`. */
  readonly frequency?: string | undefined;
  /** ISO date of the publication. */
  readonly published?: string | undefined;
  readonly counts?: Counts | undefined;
  /** The share of lines covered (the CI's), in percent, and where its report is. */
  readonly coverage?: { readonly lines: number; readonly href: string } | undefined;
  readonly commit?: { readonly sha: string; readonly url: string } | undefined;
  readonly run?: { readonly number: string; readonly url: string } | undefined;
}

/** GitHub Actions' variables a publication reads. */
export type Environment = Readonly<Record<string, string | undefined>>;

const escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

const count = (value: unknown): number => (typeof value === 'number' ? value : 0);

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/** The commit and the run of the publication, from GitHub Actions' variables; none outside them. */
function contextOf(env: Environment): Pick<ReportMeta, 'commit' | 'run'> {
  const server = env['GITHUB_SERVER_URL'] ?? 'https://github.com';
  const repository = env['GITHUB_REPOSITORY'];
  const sha = env['GITHUB_SHA'];
  const id = env['GITHUB_RUN_ID'];

  if (repository === undefined || sha === undefined || id === undefined) return {};

  return {
    commit: { sha: sha.slice(0, 7), url: `${server}/${repository}/commit/${sha}` },
    run: { number: env['GITHUB_RUN_NUMBER'] ?? id, url: `${server}/${repository}/actions/runs/${id}` },
  };
}

/** Counts without their empty kinds. */
const nonEmpty = (counts: Readonly<Record<string, number>>): Counts =>
  Object.fromEntries(KINDS.flatMap((kind) => ((counts[kind] ?? 0) > 0 ? [[kind, counts[kind] ?? 0]] : [])));

/**
 * An Allure report's metadata: its counts by kind from its summary.
 *
 * @param input - The family, title and frequency, the report's `summary.json` (parsed), its coverage summary
 *   (parsed) and where its report is, GitHub Actions' variables and the publication's date.
 * @returns What the family records.
 *
 * @example
 * allureMeta({ family: 'ci', title: 'CI', frequency: 'push', summary, env: process.env, now: new Date() });
 */
export function allureMeta(input: {
  readonly family: string;
  readonly title: string;
  readonly frequency?: string | undefined;
  readonly summary: unknown;
  readonly coverage?: unknown;
  readonly coverageHref?: string | undefined;
  readonly env: Environment;
  readonly now: Date;
}): ReportMeta {
  const stats = field(input.summary, 'stats');
  const lines = field(field(field(input.coverage, 'total'), 'lines'), 'pct');

  return {
    family: input.family,
    title: input.title,
    frequency: input.frequency,
    published: input.now.toISOString(),
    counts: nonEmpty(Object.fromEntries(KINDS.map((kind) => [kind, count(field(stats, kind))]))),
    ...(typeof lines === 'number' && input.coverageHref !== undefined
      ? { coverage: { lines, href: input.coverageHref } }
      : {}),
    ...contextOf(input.env),
  };
}

/**
 * The load test's metadata: its budgets, within (passed) and over (failed), from its report.
 *
 * @param input - The family, title and frequency, the report's Markdown, GitHub Actions' variables and the date.
 * @returns What the family records.
 *
 * @example
 * markdownMeta({ family: 'load', title: 'Load test', frequency: 'weekly', markdown, env: process.env, now });
 */
export function markdownMeta(input: {
  readonly family: string;
  readonly title: string;
  readonly frequency?: string | undefined;
  readonly markdown: string;
  readonly env: Environment;
  readonly now: Date;
}): ReportMeta {
  const rows = input.markdown.split('\n').filter((line) => /^\|.*\|\s*(✓|✖)\s*\|$/.test(line));
  const over = rows.filter((line) => /✖\s*\|$/.test(line)).length;

  return {
    family: input.family,
    title: input.title,
    frequency: input.frequency,
    published: input.now.toISOString(),
    counts: nonEmpty({ passed: rows.length - over, failed: over }),
    ...contextOf(input.env),
  };
}

/** The pages' address line, as a listing signs its server. */
const FOOTER = 'figatellultimate test reports · Bonaparte approves';

/** The shared look: Apache's listing, modernized, light and dark. */
const STYLE = `
:root { color-scheme: light dark; --ink: #1d1f21; --muted: #6a6f75; --rule: #c9ccd1; --link: #0b57d0; --passed: #1a7f37; --failed: #cf222e; --broken: #bc4c00; --skipped: #8c959f; --paper: #fbfbf8; }
@media (prefers-color-scheme: dark) { :root { --ink: #d7dade; --muted: #8b9097; --rule: #3a3e44; --link: #7cacf8; --passed: #3fb950; --failed: #f85149; --broken: #db6d28; --skipped: #6e7681; --paper: #16181b; } }
* { box-sizing: border-box; }
body { margin: 0; padding: 32px 16px; background: var(--paper); color: var(--ink); font: 14px/1.6 ui-monospace, 'SF Mono', Menlo, Consolas, monospace; }
main { max-width: 1100px; margin: 0 auto; }
h1 { font-size: 20px; font-weight: 600; margin: 0 0 16px; }
h2 { font-size: 15px; margin: 28px 0 8px; }
hr { border: 0; border-top: 1px solid var(--rule); margin: 12px 0; }
a { color: var(--link); text-decoration: none; }
a:hover, a:focus-visible { text-decoration: underline; }
.scroll { overflow-x: auto; margin: 12px 0; }
table { border-collapse: collapse; width: 100%; }
th { text-align: left; font-weight: 600; color: var(--muted); padding: 4px 24px 4px 0; border-bottom: 1px solid var(--rule); white-space: nowrap; }
td { padding: 4px 24px 4px 0; vertical-align: top; white-space: nowrap; }
.muted { color: var(--muted); }
.count, .coverage { display: block; }
.count::before { content: '●'; margin-right: 6px; }
/* The coverage's mark: a half-filled circle, the dots' width, in grey (it is no test's status). */
.coverage::before { content: '◑'; margin-right: 6px; color: var(--muted); }
.count.passed::before { color: var(--passed); }
.count.failed::before { color: var(--failed); }
.count.broken::before { color: var(--broken); }
.count.skipped::before { color: var(--skipped); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
ul { margin: 0; padding-left: 20px; }
code { font: inherit; }
address { font-style: normal; color: var(--muted); }
`;

const page = (title: string, body: string, footer: string): string =>
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
${body}
<hr>
<address>${footer}</address>
</main>
</body>
</html>
`;

/** A date as a listing writes it: `2026-11-19 06:12 UTC`. */
const dateOf = (iso: string | undefined): string =>
  iso === undefined ? '-' : `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

const link = (label: string, href: string): string => `<a href="${escape(href)}">${escape(label)}</a>`;

const DASH = '<span class="muted">-</span>';

/**
 * A family's counts, one kind a line: a dot of its color and its number, the kind's word for screen readers; then,
 * for the CI alone, its coverage, linked to its report.
 */
function countsCell(counts: Counts | undefined, coverage: ReportMeta['coverage']): string {
  const lines = KINDS.flatMap((kind) => {
    const n = counts?.[kind] ?? 0;

    return n > 0
      ? [`<span class="count ${kind}" title="${String(n)} ${kind}">${String(n)}<span class="sr"> ${kind}</span></span>`]
      : [];
  });

  const covered =
    coverage === undefined
      ? []
      : [`<span class="coverage">${link(`coverage ${coverage.lines.toFixed(1)}%`, coverage.href)}</span>`];

  return lines.length + covered.length === 0 ? DASH : [...lines, ...covered].join('');
}

/**
 * The index of every published report.
 *
 * @param reports - Each family's metadata (or its name alone, for a family that recorded none).
 * @returns The page: `Index of /figatellultimate/`, one row per family sorted by name: its date, its counts by kind,
 *   its coverage last among them (the CI's), its commit, its run's number and its frequency.
 *
 * @example
 * renderIndex([{ family: 'ci', title: 'CI', frequency: 'push', counts: { passed: 8512 } }]);
 */
export function renderIndex(reports: readonly ReportMeta[]): string {
  const rows = [...reports]
    .sort((a, b) => (a.family < b.family ? -1 : a.family > b.family ? 1 : 0))
    .map(
      (report) => `<tr>
<td><a href="${escape(report.family)}/">${escape(report.family)}/</a></td>
<td>${escape(dateOf(report.published))}</td>
<td>${countsCell(report.counts, report.coverage)}</td>
<td>${report.commit === undefined ? DASH : link(report.commit.sha, report.commit.url)}</td>
<td>${report.run === undefined ? DASH : link(`#${report.run.number}`, report.run.url)}</td>
<td>${report.frequency === undefined ? DASH : escape(report.frequency)}</td>
</tr>`,
    );

  return page(
    'figatellultimate test reports',
    `<h1>Index of /figatellultimate/</h1>
<div class="scroll">
<table>
<thead><tr><th>Name</th><th>Last modified</th><th>Results</th><th>Commit</th><th>Run</th><th>Frequency</th></tr></thead>
<tbody>
${rows.join('\n')}
</tbody>
</table>
</div>`,
    escape(FOOTER),
  );
}

/** Inline Markdown: code spans, then bold, the rest escaped. */
const inline = (text: string): string =>
  text
    .split(/(`[^`]*`)/)
    .map((part) =>
      part.startsWith('`') && part.endsWith('`') && part.length > 1
        ? `<code>${escape(part.slice(1, -1))}</code>`
        : escape(part).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'),
    )
    .join('');

const cells = (line: string): string[] =>
  line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

/**
 * A Markdown report as a page of the same look: its headings, lists, tables, code spans and bold, escaped.
 *
 * @param title - The page's title.
 * @param markdown - The report.
 * @param back - The index's URL, linked as the parent directory.
 * @returns The page.
 *
 * @example
 * renderMarkdownPage('Load test', '# Load test\n\n- next build: 38 s\n', '../');
 */
export function renderMarkdownPage(title: string, markdown: string, back: string): string {
  const html: string[] = [];
  const lines = markdown.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    if (line.startsWith('# ')) html.push(`<h1>${inline(line.slice(2))}</h1>`);
    else if (line.startsWith('## ')) html.push(`<h2>${inline(line.slice(3))}</h2>`);
    else if (line.startsWith('- ')) {
      const items: string[] = [];

      for (; i < lines.length && (lines[i] ?? '').startsWith('- '); i++)
        items.push(`<li>${inline((lines[i] ?? '').slice(2))}</li>`);

      i--;
      html.push(`<ul>${items.join('')}</ul>`);
    } else if (line.startsWith('|')) {
      const block: string[] = [];

      for (; i < lines.length && (lines[i] ?? '').startsWith('|'); i++) block.push(lines[i] ?? '');

      i--;
      const [head = '', , ...body] = block;

      html.push(
        `<div class="scroll"><table><thead><tr>${cells(head)
          .map((cell) => `<th>${inline(cell)}</th>`)
          .join('')}</tr></thead><tbody>${body
          .map(
            (row) =>
              `<tr>${cells(row)
                .map((cell) => `<td>${inline(cell)}</td>`)
                .join('')}</tr>`,
          )
          .join('')}</tbody></table></div>`,
      );
    } else if (line.trim() !== '') html.push(`<p>${inline(line)}</p>`);
  }

  return page(
    title,
    `<p><a href="${escape(back)}">../</a> <span class="muted">Parent Directory</span></p>\n${html.join('\n')}`,
    escape(FOOTER),
  );
}

/** Counts from results phrased the way earlier publications recorded them: `8512 passed, 2 failed`. */
const phrased = (results: string): Counts =>
  nonEmpty(
    Object.fromEntries(
      [...results.matchAll(/(\d+) (passed|failed|broken|skipped)/g)].map((m) => [m[2] ?? '', Number(m[1])]),
    ),
  );

/**
 * A family's recorded metadata, read back field by field (a file of the site, never trusted as is), or `undefined`
 * when it has no title.
 *
 * @param recorded - The parsed `_history/<family>.json`.
 * @param family - The family it belongs to.
 * @returns The metadata, every field checked; results an earlier publication phrased are read as counts.
 */
export function metaOf(recorded: unknown, family: string): ReportMeta | undefined {
  const title = text(field(recorded, 'title'));

  if (title === undefined) return undefined;

  const recordedCounts = field(recorded, 'counts');
  const results = text(field(recorded, 'results'));
  const sha = text(field(field(recorded, 'commit'), 'sha'));
  const commitUrl = text(field(field(recorded, 'commit'), 'url'));
  const number = text(field(field(recorded, 'run'), 'number'));
  const runUrl = text(field(field(recorded, 'run'), 'url'));
  const lines = field(field(recorded, 'coverage'), 'lines');
  const coverageHref = text(field(field(recorded, 'coverage'), 'href'));
  const counts =
    typeof recordedCounts === 'object' && recordedCounts !== null
      ? nonEmpty(Object.fromEntries(KINDS.map((kind) => [kind, count(field(recordedCounts, kind))])))
      : results === undefined
        ? undefined
        : phrased(results);

  return {
    family,
    title,
    frequency: text(field(recorded, 'frequency')),
    published: text(field(recorded, 'published')),
    counts,
    coverage: typeof lines === 'number' && coverageHref !== undefined ? { lines, href: coverageHref } : undefined,
    commit: sha === undefined || commitUrl === undefined ? undefined : { sha, url: commitUrl },
    run: number === undefined || runUrl === undefined ? undefined : { number, url: runUrl },
  };
}

/** Every family's metadata in a site: its recorded one, else its name alone. */
function siteReports(site: string): ReportMeta[] {
  const history = join(site, '_history');

  if (!existsSync(history)) return [];

  const families = new Set(
    readdirSync(history)
      .filter((name) => name.endsWith('.title') || name.endsWith('.json'))
      .map((name) => name.replace(/\.(title|json)$/, '')),
  );

  return [...families].map((family): ReportMeta => {
    const json = join(history, `${family}.json`);
    const title = join(history, `${family}.title`);
    const recorded: unknown = existsSync(json) ? JSON.parse(readFileSync(json, 'utf8')) : undefined;

    return (
      metaOf(recorded, family) ?? { family, title: existsSync(title) ? readFileSync(title, 'utf8').trim() : family }
    );
  });
}

if (import.meta.main) {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      family: { type: 'string' },
      title: { type: 'string' },
      frequency: { type: 'string' },
      site: { type: 'string' },
      report: { type: 'string' },
      markdown: { type: 'string' },
      coverage: { type: 'string' },
      out: { type: 'string' },
    },
  });
  const now = new Date();

  switch (positionals[0]) {
    case 'meta': {
      const { family = '', title = '', frequency, site = '.' } = values;
      const summary = values.report === undefined ? undefined : join(values.report, 'summary.json');
      const coverage = values.coverage;
      const meta =
        values.markdown === undefined
          ? allureMeta({
              family,
              title,
              frequency,
              summary:
                summary !== undefined && existsSync(summary) ? JSON.parse(readFileSync(summary, 'utf8')) : undefined,
              ...(coverage !== undefined && existsSync(coverage)
                ? { coverage: JSON.parse(readFileSync(coverage, 'utf8')), coverageHref: `${family}/coverage/` }
                : {}),
              env: process.env,
              now,
            })
          : markdownMeta({
              family,
              title,
              frequency,
              markdown: readFileSync(values.markdown, 'utf8'),
              env: process.env,
              now,
            });

      mkdirSync(join(site, '_history'), { recursive: true });
      writeFileSync(join(site, '_history', `${family}.json`), `${JSON.stringify(meta, null, 2)}\n`);
      writeFileSync(join(site, '_history', `${family}.title`), `${title}\n`);
      break;
    }

    case 'index': {
      const site = values.site ?? '.';

      writeFileSync(join(site, 'index.html'), renderIndex(siteReports(site)));
      break;
    }

    case 'page': {
      const out = values.out ?? 'index.html';

      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, renderMarkdownPage(values.title ?? '', readFileSync(values.markdown ?? '', 'utf8'), '../'));
      break;
    }

    default:
      process.stderr.write('usage: node tooling/reports-index.ts meta|index|page [options]\n');
      process.exitCode = 2;
  }
}
