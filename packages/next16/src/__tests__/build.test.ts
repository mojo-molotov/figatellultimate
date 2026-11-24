// The build's own files, as `next build` writes them: generated in a disposable folder.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { FileSystem } from '@japa/file-system';
import { afterEach, describe, expect, it } from 'vitest';

import { copyIntoOutput, prerenderedPages } from '../build.js';

const ROUTE = '/[locale]/[[...url]]/page';
const HASHED = join('server', 'route-cache', 'APP_PAGE', createHash('sha256').update(ROUTE).digest('hex'), '$');
const project = new FileSystem(join(import.meta.dirname, '..', '..', '.tmp', randomUUID()));
const next = (): string => join(project.basePath, '.next');

afterEach(() => project.cleanup());

describe('prerenderedPages', () => {
  it.each([
    ['without a deployment adapter', join('server', 'app')],
    ['with one, under its route’s hashed folder', HASHED],
  ])('finds the pages %s', async (_, folder) => {
    await project.create(join('.next', folder, 'fr.html'), '<html></html>');

    expect(prerenderedPages({ next: next(), route: ROUTE, home: 'fr.html' })).toBe(join(next(), folder));
  });

  it('takes the folder holding the home, never a hashed one left over from an earlier build', async () => {
    await project.create(join('.next', HASHED, 'en.html'), '<html></html>');
    await project.create(join('.next', 'server', 'app', 'fr.html'), '<html></html>');

    expect(prerenderedPages({ next: next(), route: ROUTE, home: 'fr.html' })).toBe(join(next(), 'server', 'app'));
  });

  it('answers the plain folder when none holds the home, for the search to report it', () => {
    expect(prerenderedPages({ next: next(), route: ROUTE, home: 'fr.html' })).toBe(join(next(), 'server', 'app'));
  });
});

describe('copyIntoOutput', () => {
  it('copies a folder into the adapter’s static output, which the deployment serves', async () => {
    await project.create(join('public', 'pagefind', 'pagefind.js'), 'search');
    await project.create(join('.next', 'output', 'config.json'), '{}');

    expect(copyIntoOutput({ next: next(), from: join(project.basePath, 'public', 'pagefind'), to: 'pagefind' })).toBe(
      true,
    );
    expect(existsSync(join(next(), 'output', 'static', 'pagefind', 'pagefind.js'))).toBe(true);
  });

  it('copies nothing without an adapter: `public/` is served as is', async () => {
    await project.create(join('public', 'pagefind', 'pagefind.js'), 'search');
    await project.create(join('.next', 'server', 'app', 'fr.html'), '<html></html>');

    expect(copyIntoOutput({ next: next(), from: join(project.basePath, 'public', 'pagefind'), to: 'pagefind' })).toBe(
      false,
    );
    expect(existsSync(join(next(), 'output'))).toBe(false);
  });
});
