// The example's search index, after `next build`: `figatellultimate search` on the folder where Next wrote the
// prerendered pages, which depends on whether a deployment adapter is plugged in.
//
// - Without an adapter (local, CI): `.next/server/app/<locale>/<path>.html`.
// - With one (Vercel sets `adapterPath`): Next 16 writes every prerendered page of a route under
//   `.next/server/route-cache/APP_PAGE/<sha256 of the source route>/$/<locale>/<path>.html`, the same tree under a
//   hashed folder. Every content page is the one route `app/[locale]/[[...url]]/page`, so one folder holds them all.
//
// The site is the first of the two that holds the default locale's home page: a hashed folder can be left over
// from an earlier build, so its presence alone says nothing.
//
// The adapter also assembles the deployment during `next build` (`.next/output`), before this script runs: a bundle
// written to `public/pagefind` only would not be deployed, so it is copied into `.next/output/static/pagefind` too.
//
// Rejected: pointing `--site` at the hashed folder in package.json (the hash is Next's internal layout, and a
// shell substitution does not run on Windows); turning Vercel's adapter off (it is how Vercel serves Next).
import { createHash } from 'node:crypto';
import { cpSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import process, { argv } from 'node:process';

import { main } from '@figatellultimate/cli';

import { defaultLocale } from '#figatellultimate/locales';

const next = join(import.meta.dirname, '..', '.next');
const route = createHash('sha256').update('/[locale]/[[...url]]/page').digest('hex');
const candidates = [join(next, 'server', 'app'), join(next, 'server', 'route-cache', 'APP_PAGE', route, '$')];
const site = candidates.find((folder) => existsSync(join(folder, `${defaultLocale}.html`))) ?? candidates[0];
const out = join(import.meta.dirname, '..', 'public', 'pagefind');

// Relative to the working directory, as the command line shows them.
const shown = (path: string): string => relative(process.cwd(), path);
const code = await main(['search', '--site', shown(site), '--out', shown(out), '--locale-folders', ...argv.slice(2)]);
const output = join(next, 'output');

process.exitCode = code;

if (code === 0 && existsSync(output)) {
  cpSync(out, join(output, 'static', 'pagefind'), { recursive: true });
  console.log('Copied the search index into the adapter’s output (.next/output/static/pagefind)');
}
