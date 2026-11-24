// The example's search index, after `next build`: `figatellultimate search` on the folder where Next wrote the
// prerendered pages, then copied into the deployment adapter's output when there is one (Vercel), where a bundle
// written to `public/pagefind` only would not be deployed. Next's layout is `@figatellultimate/next16/build`'s.
import { join, relative } from 'node:path';
import process, { argv } from 'node:process';

import { main } from '@figatellultimate/cli';
import { copyIntoOutput, prerenderedPages } from '@figatellultimate/next16/build';

import { defaultLocale } from '#figatellultimate/locales';

const next = join(import.meta.dirname, '..', '.next');
// Every content page is the one catch-all route: one folder holds them all.
const site = prerenderedPages({ next, route: '/[locale]/[[...url]]/page', home: `${defaultLocale}.html` });
const out = join(import.meta.dirname, '..', 'public', 'pagefind');

// Relative to the working directory, as the command line shows them.
const shown = (path: string): string => relative(process.cwd(), path);
const code = await main(['search', '--site', shown(site), '--out', shown(out), '--locale-folders', ...argv.slice(2)]);

process.exitCode = code;

if (code === 0 && copyIntoOutput({ next, from: out, to: 'pagefind' }))
  console.log('Copied the search index into the adapter’s output (.next/output/static/pagefind)');
