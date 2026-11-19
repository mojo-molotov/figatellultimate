/**
 * The index of the published test reports (GitHub Pages' root), in the look of a modernized Apache directory
 * listing, and the load test's own page; the metadata each family records when it publishes.
 *
 *     a family publishes ──> its metadata (`_history/<family>.json`: date, status, results, commit, run, notes)
 *     every publication  ──> renderIndex(every family's metadata) ──> index.html
 *     the load test      ──> renderMarkdownPage(load-report.md) ──> load/index.html
 *
 *     node tooling/reports-index.ts meta --family ci --title … --site .allure-reports [--report …] [--markdown …]
 *                                        [--history history.jsonl] [--coverage coverage/coverage-summary.json]
 *     node tooling/reports-index.ts index --site .allure-reports
 *     node tooling/reports-index.ts page --markdown load-report.md --title … --out load/index.html
 *
 * Key design decisions:
 *     - Static: written at publication, read from what that publication has (the report's summary, the coverage,
 *       the history, GitHub Actions' variables). Rejected: the workflows' live state through GitHub's API at each
 *       visit, a network call and a rate limit for a page meant to be plain.
 *     - Each family records its own metadata: a publication only renders its family, so the index reads the others'
 *       from what they recorded; a family's line is as of its last publication. A family without any (an older
 *       publication) is listed by its title alone.
 *     - Apache's listing, modernized: its title, columns and rules, in a fixed-width font with a dark theme; the
 *       results, the commit and the run as columns, no size (a report's size says nothing of the tests).
 *     - The load test's report is Markdown (its job summary): rendered here for its subset (headings, lists,
 *       tables, code, bold), escaped, in the same look. Rejected: a Markdown library for one page.
 *
 * Invariants (`__tests__/reports-index.test.ts`): every text is escaped; families sorted by name; a family without
 * metadata still listed; a report's status and counts from its summary; the load test's from its budgets.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

/** What a family records when it publishes. */
export interface ReportMeta {
  readonly family: string;
  readonly title: string;
  /** ISO date of the publication. */
  readonly published?: string | undefined;
  readonly status?: 'passed' | 'failed' | undefined;
  /** The results in a few words: `8512 passed`, `16 budgets within`. */
  readonly results?: string | undefined;
  readonly commit?: { readonly sha: string; readonly url: string } | undefined;
  readonly run?:
    { readonly number: string; readonly url: string; readonly event: string; readonly ref: string } | undefined;
  /** Short notes, each with an optional link: the coverage, the history kept. */
  readonly notes?: readonly { readonly text: string; readonly href?: string | undefined }[] | undefined;
}

/** GitHub Actions' variables a publication reads. */
export type Environment = Readonly<Record<string, string | undefined>>;

const escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

const count = (value: unknown): number => (typeof value === 'number' ? value : 0);

/** The commit and the run of the publication, from GitHub Actions' variables; none outside them. */
function contextOf(env: Environment): Pick<ReportMeta, 'commit' | 'run'> {
  const server = env['GITHUB_SERVER_URL'] ?? 'https://github.com';
  const repository = env['GITHUB_REPOSITORY'];
  const sha = env['GITHUB_SHA'];
  const id = env['GITHUB_RUN_ID'];

  if (repository === undefined || sha === undefined || id === undefined) return {};

  return {
    commit: { sha: sha.slice(0, 7), url: `${server}/${repository}/commit/${sha}` },
    run: {
      number: env['GITHUB_RUN_NUMBER'] ?? id,
      url: `${server}/${repository}/actions/runs/${id}`,
      event: env['GITHUB_EVENT_NAME'] ?? '',
      ref: env['GITHUB_REF_NAME'] ?? '',
    },
  };
}

/**
 * An Allure report's metadata: its status and counts from its summary, the history kept, the coverage (the CI's).
 *
 * @param input - The family and title, the report's `summary.json` (parsed), the history's runs and limit, the
 *   coverage summary (parsed) and where its report is, GitHub Actions' variables and the publication's date.
 * @returns What the family records.
 *
 * @example
 * allureMeta({ family: 'ci', title: 'CI', summary, history: { runs: 3, limit: 5 }, env: process.env, now });
 */
export function allureMeta(input: {
  readonly family: string;
  readonly title: string;
  readonly summary: unknown;
  readonly history?: { readonly runs: number; readonly limit: number } | undefined;
  readonly coverage?: unknown;
  readonly coverageHref?: string | undefined;
  readonly env: Environment;
  readonly now: Date;
}): ReportMeta {
  const stats = field(input.summary, 'stats');
  const failed = count(field(stats, 'failed')) + count(field(stats, 'broken'));
  const parts = [
    `${String(count(field(stats, 'passed')))} passed`,
    ...(failed > 0 ? [`${String(failed)} failed`] : []),
    ...(count(field(stats, 'skipped')) > 0 ? [`${String(count(field(stats, 'skipped')))} skipped`] : []),
  ];
  const lines = field(field(field(input.coverage, 'total'), 'lines'), 'pct');

  return {
    family: input.family,
    title: input.title,
    published: input.now.toISOString(),
    status: failed > 0 || field(input.summary, 'status') === 'failed' ? 'failed' : 'passed',
    results: parts.join(', '),
    ...contextOf(input.env),
    notes: [
      ...(typeof lines === 'number'
        ? [
            {
              text: `coverage ${lines.toFixed(1)}%`,
              ...(input.coverageHref === undefined ? {} : { href: input.coverageHref }),
            },
          ]
        : []),
      ...(input.history === undefined
        ? []
        : [{ text: `history ${String(input.history.runs)}/${String(input.history.limit)}` }]),
    ],
  };
}

/**
 * The load test's metadata: its status and counts from the budgets of its report.
 *
 * @param input - The family and title, the report's Markdown, GitHub Actions' variables and the date.
 * @returns What the family records: failed when a budget is over (`✖`).
 *
 * @example
 * markdownMeta({ family: 'load', title: 'Load test', markdown, env: process.env, now });
 */
export function markdownMeta(input: {
  readonly family: string;
  readonly title: string;
  readonly markdown: string;
  readonly env: Environment;
  readonly now: Date;
}): ReportMeta {
  const rows = input.markdown.split('\n').filter((line) => /^\|.*\|\s*(✓|✖)\s*\|$/.test(line));
  const over = rows.filter((line) => /✖\s*\|$/.test(line)).length;

  return {
    family: input.family,
    title: input.title,
    published: input.now.toISOString(),
    status: over > 0 ? 'failed' : 'passed',
    results:
      over > 0 ? `${String(over)} of ${String(rows.length)} budgets over` : `${String(rows.length)} budgets within`,
    ...contextOf(input.env),
    notes: [],
  };
}

/** The shared look: Apache's listing, modernized, light and dark. */
const STYLE = `
:root { color-scheme: light dark; --ink: #1d1f21; --muted: #6a6f75; --rule: #c9ccd1; --link: #0b57d0; --ok: #1a7f37; --ko: #cf222e; --paper: #fbfbf8; }
@media (prefers-color-scheme: dark) { :root { --ink: #d7dade; --muted: #8b9097; --rule: #3a3e44; --link: #7cacf8; --ok: #3fb950; --ko: #f85149; --paper: #16181b; } }
* { box-sizing: border-box; }
body { margin: 0; padding: 32px 16px; background: var(--paper); color: var(--ink); font: 14px/1.6 ui-monospace, 'SF Mono', Menlo, Consolas, monospace; }
main { max-width: 1100px; margin: 0 auto; }
h1 { font-size: 20px; font-weight: 600; margin: 0 0 16px; }
h2 { font-size: 15px; margin: 28px 0 8px; }
hr { border: 0; border-top: 1px solid var(--rule); margin: 12px 0; }
a { color: var(--link); text-decoration: none; }
a:hover, a:focus-visible { text-decoration: underline; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; }
th { text-align: left; font-weight: 600; color: var(--muted); padding: 4px 16px 4px 0; border-bottom: 1px solid var(--rule); white-space: nowrap; }
td { padding: 4px 16px 4px 0; vertical-align: top; white-space: nowrap; }
td.description { white-space: normal; min-width: 18ch; }
.scroll { margin: 12px 0; }
.muted { color: var(--muted); }
.status::before { content: '●'; margin-right: 6px; }
.status.passed::before { color: var(--ok); }
.status.failed::before { color: var(--ko); }
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

/** What started a run, in a word. */
const EVENTS: Readonly<Record<string, string>> = {
  push: 'push',
  schedule: 'weekly',
  workflow_dispatch: 'manual',
  pull_request: 'pull request',
};

/** A date as a listing writes it: `2026-11-19 06:12 UTC`. */
const dateOf = (iso: string | undefined): string =>
  iso === undefined ? '-' : `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

const link = (text: string, href: string | undefined): string =>
  href === undefined ? escape(text) : `<a href="${escape(href)}">${escape(text)}</a>`;

/**
 * The index of every published report.
 *
 * @param reports - Each family's metadata (or its title alone, for a family that recorded none).
 * @param host - The site's host, for the listing's address line.
 * @returns The page: `Index of /figatellultimate/`, one row per family sorted by name, Apache's columns in its
 *   order (the description last): its date, results, commit, run, then its title with its notes.
 *
 * @example
 * renderIndex([{ family: 'ci', title: 'CI', status: 'passed', results: '8512 passed' }], 'mojo-molotov.github.io');
 */
export function renderIndex(reports: readonly ReportMeta[], host: string): string {
  const rows = [...reports]
    .sort((a, b) => (a.family < b.family ? -1 : a.family > b.family ? 1 : 0))
    .map((report) => {
      const results =
        report.results === undefined
          ? '<span class="muted">-</span>'
          : `<span class="status ${report.status ?? ''}">${escape(report.results)}</span>`;
      const run =
        report.run === undefined
          ? '<span class="muted">-</span>'
          : `${link(`#${report.run.number}`, report.run.url)} <span class="muted">${escape(
              EVENTS[report.run.event] ?? report.run.event,
            )}</span>`;
      const notes = (report.notes ?? []).map((note) => link(note.text, note.href)).join(' · ');

      return `<tr>
<td><a href="${escape(report.family)}/">${escape(report.family)}/</a></td>
<td>${escape(dateOf(report.published))}</td>
<td>${results}</td>
<td>${report.commit === undefined ? '<span class="muted">-</span>' : link(report.commit.sha, report.commit.url)}</td>
<td>${run}</td>
<td class="description">${escape(report.title)}${notes === '' ? '' : ` <span class="muted">· ${notes}</span>`}</td>
</tr>`;
    });

  return page(
    'figatellultimate test reports',
    `<h1>Index of /figatellultimate/</h1>
<div class="scroll">
<table>
<thead><tr><th>Name</th><th>Last modified</th><th>Results</th><th>Commit</th><th>Run</th><th>Description</th></tr></thead>
<tbody>
${rows.join('\n')}
</tbody>
</table>
</div>`,
    `figatellultimate test reports · ${escape(host)}`,
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
    'figatellultimate test reports',
  );
}

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/**
 * A family's recorded metadata, read back field by field (a file of the site, never trusted as is), or `undefined`
 * when it has no title.
 *
 * @param recorded - The parsed `_history/<family>.json`.
 * @param family - The family it belongs to.
 * @returns The metadata, every field checked.
 */
export function metaOf(recorded: unknown, family: string): ReportMeta | undefined {
  const title = text(field(recorded, 'title'));

  if (title === undefined) return undefined;

  const status = field(recorded, 'status');
  const commit = field(recorded, 'commit');
  const run = field(recorded, 'run');
  const sha = text(field(commit, 'sha'));
  const commitUrl = text(field(commit, 'url'));
  const number = text(field(run, 'number'));
  const runUrl = text(field(run, 'url'));
  const notes = field(recorded, 'notes');

  return {
    family,
    title,
    published: text(field(recorded, 'published')),
    status: status === 'passed' || status === 'failed' ? status : undefined,
    results: text(field(recorded, 'results')),
    commit: sha === undefined || commitUrl === undefined ? undefined : { sha, url: commitUrl },
    run:
      number === undefined || runUrl === undefined
        ? undefined
        : { number, url: runUrl, event: text(field(run, 'event')) ?? '', ref: text(field(run, 'ref')) ?? '' },
    notes: Array.isArray(notes)
      ? notes.flatMap((note: unknown) => {
          const noteText = text(field(note, 'text'));

          return noteText === undefined ? [] : [{ text: noteText, href: text(field(note, 'href')) }];
        })
      : [],
  };
}

/** Every family's metadata in a site: its recorded one, else its title alone. */
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
      site: { type: 'string' },
      report: { type: 'string' },
      markdown: { type: 'string' },
      history: { type: 'string' },
      limit: { type: 'string' },
      coverage: { type: 'string' },
      out: { type: 'string' },
    },
  });
  const read = (path: string | undefined): unknown =>
    path !== undefined && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
  const now = new Date();

  switch (positionals[0]) {
    case 'meta': {
      const { family = '', title = '', site = '.' } = values;
      const runs =
        values.history !== undefined && existsSync(values.history)
          ? readFileSync(values.history, 'utf8')
              .split('\n')
              .filter((line) => line.trim() !== '').length
          : undefined;
      const meta =
        values.markdown === undefined
          ? allureMeta({
              family,
              title,
              summary: read(values.report === undefined ? undefined : join(values.report, 'summary.json')),
              ...(runs === undefined ? {} : { history: { runs, limit: Number(values.limit ?? runs) } }),
              coverage: read(values.coverage),
              ...(values.coverage === undefined ? {} : { coverageHref: `${family}/coverage/` }),
              env: process.env,
              now,
            })
          : markdownMeta({ family, title, markdown: readFileSync(values.markdown, 'utf8'), env: process.env, now });

      mkdirSync(join(site, '_history'), { recursive: true });
      writeFileSync(join(site, '_history', `${family}.json`), `${JSON.stringify(meta, null, 2)}\n`);
      writeFileSync(join(site, '_history', `${family}.title`), `${title}\n`);
      break;
    }

    case 'index': {
      const site = values.site ?? '.';
      const host = `${(process.env['GITHUB_REPOSITORY_OWNER'] ?? 'localhost').toLowerCase()}.github.io`;

      writeFileSync(join(site, 'index.html'), renderIndex(siteReports(site), host));
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
