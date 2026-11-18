/**
 * French typography: the example's French text is spaced the French way, with non-breaking spaces, so that a
 * colon, a question mark or a closing guillemet never starts a line.
 *
 *     content/**.mdx (not under en/)  ─┐
 *     messages/fr.ts (its strings)    ─┴──> prose (code, inline code, URLs and link targets left out) ──> findings
 *
 * The rule (CLAUDE.md, "Language"):
 *     - a no-break space (U+00A0) before ":";
 *     - a narrow no-break space (U+202F) before ";", "!" and "?", and inside « »;
 *     - never an ordinary space there, nor none at all before ";", "!" and "?".
 *
 * Key design decisions:
 *     - The prose only: code blocks, inline code, URLs and link targets follow their own syntax (`?page=2`, `a: b`).
 *     - A colon without any space is not reported: times, ratios and keys (`10:30`, `1:2`) are not prose.
 *     - The messages' strings are read with the compiler, so that the code's own `;` is never mistaken for prose.
 *
 * Limitations: English text is not checked (it takes no space there); a French text outside the content and the
 * messages (a component's literal) is not checked, and has none by design.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const EXAMPLE = join(ROOT, 'examples', 'next');

/** What the rule leaves out of a text: fenced and inline code, URLs, and Markdown link targets. */
const NOT_PROSE = /```[^]*?```|`[^`\n]*`|https?:\/\/\S+|\]\([^)]*\)/g;

/** A wrong spacing: an ordinary space (or none) where a no-break one belongs. */
const WRONG = [
  { pattern: /[ \t\u202f]:/g, fix: 'a no-break space (U+00A0) before ":"' },
  { pattern: /[ \t\u00a0][;!?]/g, fix: 'a narrow no-break space (U+202F) before ";", "!" and "?"' },
  { pattern: /[\p{L}\p{N})\]»][;!?](?=\s|$)/gu, fix: 'a narrow no-break space (U+202F) before ";", "!" and "?"' },
  { pattern: /«(?!\u202f)|(?<!\u202f)»/g, fix: 'a narrow no-break space (U+202F) inside « »' },
] as const;

/**
 * The wrong spacings of a French text, each with its line and how to fix it.
 *
 * @param text - Markdown or a message, French.
 * @returns One finding per wrong spacing, in order.
 */
function findingsOf(text: string): string[] {
  const prose = text.replace(NOT_PROSE, (match) => match.replace(/[^\n]/g, ' '));

  return WRONG.flatMap(({ pattern, fix }) =>
    [...prose.matchAll(pattern)].map((match) => {
      const line = prose.slice(0, match.index).split('\n').length;

      return `line ${String(line)}: "${text.slice(Math.max(0, match.index - 20), match.index + 2).trim()}" needs ${fix}`;
    }),
  );
}

/** The French MDX files of the example's content: every file not under an `en` folder. */
function frenchContent(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) return entry.name === 'en' ? [] : frenchContent(path);

    return entry.name.endsWith('.mdx') ? [path] : [];
  });
}

/** Every string literal of a TypeScript file, joined one per line. */
function stringsOf(file: string): string {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const strings: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) strings.push(node.text);

    ts.forEachChild(node, visit);
  };

  visit(source);

  return strings.join('\n');
}

describe('the French typography check', () => {
  it.each([
    ['Bonjour : le monde', 1],
    ['Vraiment ?', 1],
    ['Vraiment?', 1],
    ['« Statique. »', 2],
    ['Un point ; un autre !', 2],
  ])('reports %j (%i)', (text, count) => {
    expect(findingsOf(text)).toHaveLength(count);
  });

  it.each([
    'Bonjour\u00a0: le monde',
    'Vraiment\u202f?',
    '«\u202fStatique.\u202f»',
    'Un point\u202f; un autre\u202f!',
    'Le code `a : b ?` et [un lien](https://example.com/?page=2) restent tels quels.',
    'À 10:30, au ratio 1:2.',
    '```ts\nconst a = b ? c : d;\n```',
  ])('accepts %j', (text) => {
    expect(findingsOf(text)).toEqual([]);
  });
});

describe("the example's French text", () => {
  const files = [...frenchContent(join(EXAMPLE, 'content')), join(EXAMPLE, 'messages', 'fr.ts')];

  it('covers the content and the messages', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it.each(files.map((file) => [relative(ROOT, file), file]))('%s is spaced the French way', (_name, file) => {
    const text = file.endsWith('.ts') ? stringsOf(file) : readFileSync(file, 'utf8');

    expect(findingsOf(text)).toEqual([]);
  });
});
