/**
 * American spelling in code: identifiers, and the titles of tests, use American English (`center`, `meter`), never the
 * British spellings that read as French (`centre`, `mètre`), so that no name in the code looks French.
 *
 *     packages/<name>/src, examples/next, tooling (.ts, .tsx, .mjs) ──> the compiler's scanner ──> identifiers, and
 *                                                                       strings in tests ──> words ──> findings
 *
 * The rule (CLAUDE.md, "Language"): `center`, `meter`, `liter`, `theater`, `fiber`, `caliber`, `specter`, `luster`,
 * never their British spellings.
 *
 * Key design decisions:
 *     - The compiler's scanner, not a regular expression over the text: comments are prose, left to the writer.
 *     - An identifier's words, split at its case and underscores (`centreOf` holds `centre`).
 *     - In tests, every string too: a test's title is a name.
 *
 * Invariant: the tests' disposable trees are left out, or a tree removed mid-scan fails it (this file's own test).
 *
 * Limitations: a word outside the list is not checked; prose (comments, JSDoc, READMEs) is not either.
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { FileSystem } from '@japa/file-system';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');

/** The British spellings that read as French, and their American ones. */
const BRITISH: Readonly<Record<string, string>> = {
  centre: 'center',
  metre: 'meter',
  litre: 'liter',
  theatre: 'theater',
  fibre: 'fiber',
  calibre: 'caliber',
  spectre: 'specter',
  lustre: 'luster',
};

/** A word of the list, with its endings (`centres`, `centred`). */
const SPELLING = new RegExp(`^(${Object.keys(BRITISH).join('|')})(s|d)?$`, 'i');

/**
 * Folders where code lives, and what is left out: dependencies, builds, generated code, and the tests' disposable
 * trees (`.tmp`), which other tests create and remove while this one scans.
 */
const ROOTS = ['packages', join('examples', 'next'), 'tooling'];
const SKIPPED = new Set([
  'node_modules',
  'dist',
  '.next',
  '.figatellultimate',
  '.content-collections',
  'coverage',
  '.tmp',
]);

function sources(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);

    if (entry.isDirectory()) return SKIPPED.has(entry.name) ? [] : sources(path);

    return /\.(ts|tsx|mjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

/** An identifier's words: split at its case changes, digits and underscores. */
const wordsOf = (name: string): string[] =>
  name
    .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z]+/)
    .filter((word) => word !== '');

/**
 * The British spellings a source names things with: its identifiers, and in a test, its strings too.
 *
 * @param text - A source's text.
 * @param test - Whether it is a test, whose strings (its titles) are names too.
 * @returns Each finding, the word and its American spelling.
 */
function findings(text: string, test: boolean): string[] {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.JSX, text);
  const found: string[] = [];

  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    const named =
      token === ts.SyntaxKind.Identifier ||
      token === ts.SyntaxKind.PrivateIdentifier ||
      (test && (token === ts.SyntaxKind.StringLiteral || token === ts.SyntaxKind.NoSubstitutionTemplateLiteral));

    if (!named) continue;

    for (const word of wordsOf(scanner.getTokenValue())) {
      const match = SPELLING.exec(word);

      if (match !== null) found.push(`${word} (${BRITISH[(match[1] ?? '').toLowerCase()] ?? '?'})`);
    }
  }

  return found;
}

describe('American spelling in code', () => {
  // A test's disposable tree, as the other tests write theirs while this one runs.
  const disposable = new FileSystem(join(ROOT, 'tooling', '.tmp', randomUUID()));

  afterEach(async () => {
    await disposable.cleanup();
  });

  it("leaves out the tests' disposable trees, which other tests create and remove while it scans", async () => {
    await disposable.create('british.ts', 'export const centreOf = 1;\n');
    const planted = join(disposable.basePath, 'british.ts');

    // Precondition: the planted file holds a finding.
    expect(findings(readFileSync(planted, 'utf8'), false)).toEqual(['centre (center)']);
    expect(sources(join(ROOT, 'tooling'))).not.toContain(planted);
  });

  it('finds a British spelling in an identifier and in a test title, and nothing in a comment (the control)', () => {
    expect(findings('const centreOf = 1; // the centre', false)).toEqual(['centre (center)']);
    expect(findings("it('centres a card', () => undefined);", true)).toEqual(['centres (center)']);
    expect(findings('const center = 1; /* centre */', false)).toEqual([]);
  });

  it('names nothing with a British spelling that reads as French', () => {
    // This file aside: its list and its control name the British spellings on purpose.
    const files = ROOTS.flatMap((folder) => sources(join(ROOT, folder))).filter(
      (file) => file !== import.meta.filename,
    );
    const found = files.flatMap((file) =>
      findings(readFileSync(file, 'utf8'), file.includes('__tests__')).map(
        (word) => `${relative(ROOT, file)}: ${word}`,
      ),
    );

    // Precondition: the sources were found.
    expect(files.length).toBeGreaterThan(100);
    expect(found).toEqual([]);
  });
});
