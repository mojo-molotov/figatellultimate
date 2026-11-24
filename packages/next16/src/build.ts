/**
 * `@figatellultimate/next16/build`, a Node entry: where `next build` wrote what a step after it reads or adds to, such
 * as the search index (`figatellultimate search`), whether a deployment adapter is plugged in or not.
 *
 *     without an adapter (local, CI)   .next/server/app/<locale>/<path>.html
 *     with one (Vercel's adapterPath)  .next/server/route-cache/APP_PAGE/<sha256 of the route>/$/<locale>/<path>.html
 *                                      and the deployment assembled in .next/output during `next build`
 *
 * Key design decisions:
 *     - The folder holding the home page wins: a hashed folder can be left over from an earlier build, so its presence
 *       alone says nothing.
 *     - A file a step adds after the build is copied into the adapter's output too (`copyIntoOutput`): written to
 *       `public/` only, it would not be deployed.
 *     - Rejected: pointing the search at the hashed folder from a script (the hash is Next's internal layout, and a
 *       shell substitution does not run on Windows); turning the adapter off (it is how Vercel serves Next).
 *
 * Invariants (`build.test.ts`): the pages found with or without an adapter, the folder holding the home winning over a
 * leftover one; a copy into the output only when there is one.
 *
 * Limitation: Next's internal layout, read as Next 16 writes it; a new major version of Next is a new adapter.
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The folder where `next build` wrote a route's prerendered pages.
 *
 * @param options - `next`: the build's folder (`.next`); `route`: the route's source, e.g. `/[locale]/[[...url]]/page`,
 *   which names its folder under an adapter; `home`: a page it holds, relative to the folder (e.g. `fr.html`).
 * @returns The folder holding `home`: `<next>/server/app`, or the route's under an adapter; `<next>/server/app` when
 *   neither holds it, for the step reading it to report what is missing.
 *
 * @example
 * const site = prerenderedPages({ next: '.next', route: '/[locale]/[[...url]]/page', home: 'fr.html' });
 */
export function prerenderedPages(options: {
  readonly next: string;
  readonly route: string;
  readonly home: string;
}): string {
  const plain = join(options.next, 'server', 'app');
  const hashed = join(
    options.next,
    'server',
    'route-cache',
    'APP_PAGE',
    createHash('sha256').update(options.route).digest('hex'),
    '$',
  );

  return [plain, hashed].find((folder) => existsSync(join(folder, options.home))) ?? plain;
}

/**
 * Copies a folder written after the build into the deployment adapter's static output, when there is one.
 *
 * @param options - `next`: the build's folder; `from`: the folder to copy (e.g. `public/pagefind`); `to`: its path
 *   among the deployment's static files (e.g. `pagefind`).
 * @returns `true` when copied; `false` without an adapter's output, `public/` then served as is.
 *
 * @example
 * if (copyIntoOutput({ next: '.next', from: 'public/pagefind', to: 'pagefind' })) console.log('copied');
 */
export function copyIntoOutput(options: {
  readonly next: string;
  readonly from: string;
  readonly to: string;
}): boolean {
  const output = join(options.next, 'output');

  if (!existsSync(output)) return false;

  cpSync(options.from, join(output, 'static', options.to), { recursive: true });

  return true;
}
