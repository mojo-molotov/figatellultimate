// Load test (`pnpm example:load [--posts N]`): the example copied to `.tmp/load-<N>/` (gitignored), with N generated
// posts per locale spread over the blog's four subcategories, each read through its strictly typed getter by a module
// of the copy, then timed (figatellultimate build, typecheck, next build, search index) and measured (JavaScript,
// HTML, generated code, navigation in Chromium). Plain Node, as `verify.ts`.
import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';

import { chromium, type Page } from 'playwright';

const { values } = parseArgs({
  options: { posts: { type: 'string', default: '500' }, port: { type: 'string', default: '3199' } },
});
const posts = Number(values.posts);
const port = Number(values.port);

if (!Number.isInteger(posts) || posts < 0) throw new TypeError('--posts must be a whole number');

const example = join(import.meta.dirname, '..');
const target = join(example, '..', '..', '.tmp', `load-${String(posts)}`);

// --- The copy ----------------------------------------------------------------------------------------------------
const SKIP = new Set([
  'node_modules',
  '.next',
  '.figatellultimate',
  '.content-collections',
  '.tmp',
  'pagefind',
  'tsconfig.tsbuildinfo',
]);

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(example, target, { recursive: true, filter: (source) => !SKIP.has(source.split('/').at(-1) ?? '') });
symlinkSync(join(example, 'node_modules'), join(target, 'node_modules'), 'dir');

// --- The content: real posts' bodies, new titles, dates, tags and authors (deterministic) ------------------------
let seed = 42;
const random = (): number => {
  seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;

  return seed / 2 ** 31;
};
const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] ?? list[0]!;
const bodyOf = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/^---[\s\S]*?---\n/, '')
    .replace(/^# .*\n/m, '');
const BODIES = {
  fr: bodyOf(join(example, 'content/blog/empire/decrees/imperial-decree-on-banning-of-cors-errors.mdx')),
  en: bodyOf(join(example, 'content/blog/empire/decrees/en/imperial-decree-on-banning-of-cors-errors.mdx')),
};
const SUBCATEGORIES = ['empire/decrees', 'empire/chronicles', 'maquis/corsicamon', 'maquis/kitchen'];
const COVERS = readdirSync(join(example, 'public/covers'));

for (let i = 0; i < posts; i++) {
  const slug = `load-${String(i).padStart(5, '0')}`;
  const folder = join(target, 'content/blog', SUBCATEGORIES[i % SUBCATEGORIES.length] ?? '');
  const day = new Date(Date.UTC(2020, 0, 1) + Math.floor(random() * 6 * 365) * 86_400_000).toISOString().slice(0, 10);
  const tags = ['piano', 'violin', 'flute', 'harp'].filter(() => random() < 0.5);
  const authors = random() < 0.2 ? ['igor', 'napoleon'] : [pick(['igor', 'napoleon'])];
  const cover = pick(COVERS);

  for (const [locale, title] of [
    ['fr', `Article de charge n° ${String(i)}`],
    ['en', `Load post #${String(i)}`],
  ] as const) {
    const dir = locale === 'fr' ? folder : join(folder, 'en');

    mkdirSync(dir, { recursive: true });
    const frontmatter = [
      '---',
      `featuredPictureUrl: /covers/${cover}`,
      `title: '${title}'`,
      `metadescription: '${locale === 'fr' ? 'Un article généré pour le test de charge' : 'A post generated for the load test'}'`,
      `date: ${day}`,
      `authors: [${authors.join(', ')}]`,
      `tags: [${tags.join(', ')}]`,
      '---',
    ].join('\n');

    writeFileSync(join(dir, `${slug}.mdx`), `${frontmatter}\n\n# ${title}\n${BODIES[locale]}`);
  }
}

// --- The strictly typed getters, under load ------------------------------------------------------------------------
// Every generated post read through `getBlogPost`, its query literal: the type that checks it (`BlogPostTree`, a leaf
// per post and its locales) grows with the content, so the timed typecheck measures it at this size. Wrong queries
// under `@ts-expect-error`: a type accepting anything would fail the typecheck, never pass it for nothing.
const typedCalls: string[] = [];

for (let i = 0; i < posts; i++) {
  const [category, subcategory] = (SUBCATEGORIES[i % SUBCATEGORIES.length] ?? '').split('/');
  const slug = `load-${String(i).padStart(5, '0')}`;

  for (const locale of ['fr', 'en'])
    typedCalls.push(
      `  void getBlogPost({ locale: '${locale}', category: '${category ?? ''}', subcategory: '${subcategory ?? ''}', slug: '${slug}' });`,
    );
}

if (posts > 0) {
  mkdirSync(join(target, 'lib'), { recursive: true });
  writeFileSync(
    join(target, 'lib', 'load-typed-getters.ts'),
    [
      '// Written by the load test: every generated post through its strictly typed getter, checked by the typecheck.',
      "import { getBlogPost } from '#figatellultimate/blog';",
      '',
      'export function readEveryPost(): void {',
      ...typedCalls,
      '}',
      '',
      'export function rejectWrongQueries(): void {',
      '  // @ts-expect-error a slug the content does not have',
      `  void getBlogPost({ locale: 'fr', category: 'empire', subcategory: 'decrees', slug: 'load-${String(posts).padStart(5, '0')}' });`,
      '  // @ts-expect-error a post of another subcategory',
      "  void getBlogPost({ locale: 'fr', category: 'empire', subcategory: 'chronicles', slug: 'load-00000' });",
      '  // @ts-expect-error a locale the site does not declare',
      "  void getBlogPost({ locale: 'de', category: 'empire', subcategory: 'decrees', slug: 'load-00000' });",
      '}',
      '',
    ].join('\n'),
  );
}

// --- Timed steps -------------------------------------------------------------------------------------------------
const bin = (name: string): string => join(target, 'node_modules/.bin', name);
const timings: Record<string, number> = {};

function run(label: string, command: string, args: readonly string[]): void {
  const start = performance.now();
  const result = spawnSync(command, args, {
    cwd: target,
    encoding: 'utf8',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  });

  timings[label] = (performance.now() - start) / 1000;

  if (result.status !== 0) {
    console.error(result.stdout.slice(-4000), result.stderr.slice(-4000));
    throw new Error(`${label} failed`);
  }

  console.log(`✓ ${label}: ${timings[label].toFixed(1)} s`);
}
run('figatellultimate build', bin('figatellultimate'), ['build']);
// Next generates the route types (`PageProps`, `LayoutProps`) the app's typecheck reads.
run('next typegen', bin('next'), ['typegen']);
run('typecheck (tsc)', bin('tsc'), ['--noEmit']);
run('next build', bin('next'), ['build']);
run('figatellultimate search', bin('figatellultimate'), [
  'search',
  '--site',
  '.next/server/app',
  '--out',
  'public/pagefind',
  '--locale-folders',
]);

// --- Static sizes ------------------------------------------------------------------------------------------------
const sizeOf = (path: string): number => {
  if (!existsSync(path)) return 0;

  const stat = statSync(path);

  return stat.isDirectory() ? readdirSync(path).reduce((sum, name) => sum + sizeOf(join(path, name)), 0) : stat.size;
};
const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} kB`;
const app = join(target, '.next/server/app');
const htmlFile = (url: string): string =>
  join(app, `${url.startsWith('/en') ? url : `/fr${url === '/' ? '' : url}`}.html`);
const firstPost = `/blog/${SUBCATEGORIES[0] ?? ''}/load-00000`;
const PAGES = ['/', '/blog', '/blog/empire', `/blog/${SUBCATEGORIES[0] ?? ''}`, '/authors/igor', '/docs', firstPost];
const staticJs = join(target, '.next/static');
const jsFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? jsFiles(join(dir, entry.name)) : entry.name.endsWith('.js') ? [join(dir, entry.name)] : [],
  );
const allJs = jsFiles(staticJs);
const report: string[] = [
  `# Load test: ${String(posts)} generated posts per locale`,
  '',
  '## Times',
  '',
  ...Object.entries(timings).map(([label, seconds]) => `- ${label}: ${seconds.toFixed(1)} s`),
  '',
  '## Sizes',
  '',
  `- Strictly typed getter calls typechecked: ${String(typedCalls.length)} (\`getBlogPost\`, a literal query per generated post and locale)`,
  `- Content: ${String(readdirSync(join(target, 'content/blog'), { recursive: true }).filter((name) => String(name).endsWith('.mdx')).length)} blog files`,
  `- \`.figatellultimate/\`: ${kb(sizeOf(join(target, '.figatellultimate')))}`,
  `- All client JavaScript (\`.next/static\`): ${String(allJs.length)} files, ${kb(allJs.reduce((sum, file) => sum + statSync(file).size, 0))}`,
  `- Search index (\`public/pagefind\`): ${kb(sizeOf(join(target, 'public/pagefind')))}`,
  '',
  '| Page | HTML | HTML gzip | JS loaded by the page | JS gzip |',
  '|---|---|---|---|---|',
];
const sizes = new Map<string, { readonly htmlGzip: number; readonly jsGzip: number }>();

for (const url of PAGES) {
  const html = existsSync(htmlFile(url)) ? readFileSync(htmlFile(url)) : Buffer.alloc(0);
  // Modern browsers skip `nomodule` scripts (the polyfills): not counted.
  const scripts = [...html.toString('utf8').matchAll(/<script(?![^>]*noModule)[^>]+src="\/_next\/([^"]+)"/gi)].map(
    (match) => join(target, '.next', match[1] ?? ''),
  );
  const js = [...new Set(scripts)].filter(existsSync).map((file) => readFileSync(file));
  const jsGzip = js.reduce((sum, b) => sum + gzipSync(b).length, 0);

  sizes.set(url, { htmlGzip: gzipSync(html).length, jsGzip });
  report.push(
    `| \`${url}\` | ${kb(html.length)} | ${kb(gzipSync(html).length)} | ${kb(js.reduce((sum, b) => sum + b.length, 0))} | ${kb(jsGzip)} |`,
  );
}

// --- Navigation in Chromium: what crosses the network, per step --------------------------------------------------
const stepTotals = new Map<string, number>();
const server = spawn(bin('next'), ['start', '-p', String(port)], { cwd: target, stdio: 'ignore' });

try {
  for (let i = 0; i < 60; i++) {
    const up = await fetch(`http://localhost:${String(port)}/`).then(
      (r) => r.ok,
      () => false,
    );

    if (up) break;

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const browser = await chromium.launch();
  const page: Page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const transfers: { kind: string; bytes: number }[] = [];

  page.on('requestfinished', async (request) => {
    const sizes = await request.sizes().catch(() => undefined);
    const url = request.url();
    const kind =
      url.includes('_rsc=') || request.headers()['rsc'] === '1'
        ? 'RSC'
        : /\.(jpe?g|png|svg|webp)/.test(url)
          ? 'image'
          : url.endsWith('.js')
            ? 'JS'
            : request.resourceType() === 'document'
              ? 'HTML'
              : 'other';

    transfers.push({ kind, bytes: (sizes?.responseBodySize ?? 0) + (sizes?.responseHeadersSize ?? 0) });
  });
  const base = `http://localhost:${String(port)}`;
  const steps: [string, () => Promise<unknown>][] = [
    ['open the home page', () => page.goto(`${base}/`, { waitUntil: 'networkidle' })],
    [
      'go to the blog',
      async () => {
        await page.click('[data-slot="navbar-trigger"]:has-text("Blog")');
        await page.click('a[href="/blog"] >> nth=0');
      },
    ],
    // A category and a subcategory with generated posts, wherever their pages list them: through the navbar, then
    // on the category's first page.
    [
      'go to a category',
      async () => {
        await page.click('[data-slot="navbar-trigger"]:has-text("Blog")');
        await page.click('[data-slot="navbar-content"] a[href="/blog/maquis"]');
      },
    ],
    ['go to a subcategory', () => page.click('a[href="/blog/maquis/corsicamon"] >> nth=0')],
    ['page 2', () => page.click('[data-slot="pagination-next"]')],
    [
      'sort oldest first',
      async () => {
        await page.click('[data-slot="sort-select-trigger"]');
        await page.click('[data-slot="sort-select-item"] >> nth=1');
      },
    ],
    ['open a post', () => page.click('[data-slot="entry-card-link"] >> nth=0')],
    ['back to the list', () => page.goBack()],
    ['an author page', () => page.click('a[data-slot="entry-card-author"] >> nth=0')],
    [
      'search "migrations"',
      async () => {
        await page.keyboard.press('Control+k');
        await page.keyboard.type('migrations');
      },
    ],
  ];

  report.push(
    '',
    '## Navigation in Chromium (bytes on the wire, per step, prefetches included)',
    '',
    '| Step | HTML | RSC | JS | images | other | total |',
    '|---|---|---|---|---|---|---|',
  );

  for (const [label, action] of steps) {
    transfers.length = 0;
    await action();
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(1500);
    const by = (kind: string): number => transfers.filter((t) => t.kind === kind).reduce((sum, t) => sum + t.bytes, 0);
    const total = transfers.reduce((sum, t) => sum + t.bytes, 0);

    stepTotals.set(label, total);
    report.push(
      `| ${label} | ${kb(by('HTML'))} | ${kb(by('RSC'))} (${String(transfers.filter((t) => t.kind === 'RSC').length)}) | ${kb(by('JS'))} | ${kb(by('image'))} | ${kb(by('other'))} | **${kb(total)}** |`,
    );
  }

  await browser.close();
} finally {
  server.kill();
}

// --- Budgets: what must not grow with the content, and how fast listings may -------------------------------
/** The French posts a listing holds, counted in the content: a subcategory's files, or an author's posts. */
const frenchPosts = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? entry.name === 'en'
        ? []
        : frenchPosts(join(dir, entry.name))
      : entry.name.endsWith('.mdx')
        ? [join(dir, entry.name)]
        : [],
  );
const listed = (url: string): number => {
  const author = /^\/authors\/(.+)$/.exec(url)?.[1];

  if (author === undefined) return frenchPosts(join(target, 'content', url)).length;

  return frenchPosts(join(target, 'content/blog')).filter((file) =>
    new RegExp(`^authors: \\[.*\\b${author}\\b`, 'm').test(readFileSync(file, 'utf8')),
  ).length;
};
const KB = 1024;
// A subcategory's index: every post's item and card, the JSON its listing fetches on a filter or a sort.
const indexFile = join(app, 'fr', 'listing', `${SUBCATEGORIES[0] ?? ''}.body`);
const indexGzip = existsSync(indexFile) ? gzipSync(readFileSync(indexFile)).length : Infinity;
// An author's index, the same for their posts.
const authorIndexFile = join(app, 'fr', 'author-listing', 'igor.body');
const authorIndexGzip = existsSync(authorIndexFile) ? gzipSync(readFileSync(authorIndexFile)).length : Infinity;
const budgets: [string, number, number][] = [
  // [what, measured, at most]
  ['typecheck (s)', timings['typecheck (tsc)'] ?? Infinity, 10],
  ...PAGES.map((url): [string, number, number] => [
    `JS gzip of ${url} (kB)`,
    (sizes.get(url)?.jsGzip ?? Infinity) / KB,
    240,
  ]),
  ...['/', '/blog', '/docs'].map((url): [string, number, number] => [
    `HTML gzip of ${url} (kB)`,
    (sizes.get(url)?.htmlGzip ?? Infinity) / KB,
    12,
  ]),
  ...(posts > 0
    ? [[`HTML gzip of a post (kB)`, (sizes.get(firstPost)?.htmlGzip ?? Infinity) / KB, 25] as [string, number, number]]
    : []),
  // A subcategory's page and an author's carry their slice alone: their size holds whatever the count of posts (an
  // author's page once listed every post of theirs, megabytes of HTML). Their indexes, fetched on a filter or a sort,
  // grow by under a hundred and twenty bytes per post, never the whole blog. An author's page adds the long bio, and
  // its facets span every subcategory (all the tags).
  ...(posts === 0
    ? []
    : ([
        [
          `HTML gzip of /blog/${SUBCATEGORIES[0] ?? ''} (kB)`,
          (sizes.get(`/blog/${SUBCATEGORIES[0] ?? ''}`)?.htmlGzip ?? Infinity) / KB,
          14,
        ],
        [
          `index gzip per listed post on /blog/${SUBCATEGORIES[0] ?? ''} (bytes)`,
          indexGzip / Math.max(1, listed(`/blog/${SUBCATEGORIES[0] ?? ''}`)),
          120,
        ],
        ['HTML gzip of /authors/igor (kB)', (sizes.get('/authors/igor')?.htmlGzip ?? Infinity) / KB, 16],
        [
          'index gzip per listed post on /authors/igor (bytes)',
          authorIndexGzip / Math.max(1, listed('/authors/igor')),
          120,
        ],
      ] satisfies [string, number, number][])),
  // The post's page, its images and its own JavaScript: the cover alone weighs most of it.
  ['opening a post (kB on the wire)', (stepTotals.get('open a post') ?? Infinity) / KB, 175],
];

report.push('', '## Budgets', '', '| Budget | Measured | At most | |', '|---|---|---|---|');
const over = budgets.filter(([, measured, most]) => measured > most);

for (const [label, measured, most] of budgets)
  report.push(`| ${label} | ${measured.toFixed(1)} | ${String(most)} | ${measured > most ? '✖' : '✓'} |`);

if (over.length > 0) process.exitCode = 1;

const text = `${report.join('\n')}\n`;

writeFileSync(join(target, 'load-report.md'), text);
console.log(`\n${text}\nReport: ${relative(process.cwd(), join(target, 'load-report.md'))}`);
