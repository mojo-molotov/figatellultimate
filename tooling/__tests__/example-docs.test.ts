/**
 * The example's documentation (the `docs` folders of `examples/next/content/pages`, in every language), true to the
 * code it describes: every package, entry, export, generated module and command it names exists (`namedApi`,
 * `tooling/named-api.ts`, as for the agent skills).
 *
 * Limitations: what the prose says of an option or a behavior is not checked; the names alone are.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { namedApi } from '../named-api.ts';

const EXAMPLE = join(import.meta.dirname, '..', '..', 'examples', 'next');
const PAGES = join(EXAMPLE, 'content', 'pages');

/** The example's collections: each has its generated module (`#figatellultimate/blog`). */
const collections = [
  ...readFileSync(join(EXAMPLE, 'figatellultimate.config.ts'), 'utf8').matchAll(/^ {4}(\w+): defineCollection\(/gm),
].map(([, name]) => name ?? '');

const pages = readdirSync(PAGES, { recursive: true, encoding: 'utf8' })
  .filter((path) => /(^|\/)docs\/[^/]+\.mdx$/.test(path.split('\\').join('/')))
  .map((path) => ({ path: path.split('\\').join('/'), text: readFileSync(join(PAGES, path), 'utf8') }));

describe("the example's documentation", () => {
  it('has its pages in every language: the documentation read', () => {
    // Precondition: the pages and the collections were found.
    expect(pages.filter((page) => page.path.startsWith('docs/')).length).toBeGreaterThan(5);
    expect(pages.filter((page) => page.path.startsWith('en/docs/')).length).toBeGreaterThan(5);
    expect(collections).toContain('blog');
  });

  it.each(pages)('$path: every package, entry, export, generated module and command it names exists', ({ text }) => {
    // `#figatellultimate/*` is the alias itself.
    expect(namedApi(text, [...collections, '*']).missing).toEqual([]);
  });
});
