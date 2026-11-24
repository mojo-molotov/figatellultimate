/**
 * What a site exposes to LLMs, after the llms.txt proposal (https://llmstxt.org): the `llms.txt` file, each page's
 * Markdown, and `llms-full.txt`, every page in one file.
 *
 *     the app's route ──> llmsTxtOf({ title, summary, details, sections, optional })   /llms.txt
 *                     ──> llmsMarkdownOf(the page's MDX source)                         /<page>.md (markdownUrlOf)
 *                     ──> llmsFullOf({ title, summary, pages })                         /llms-full.txt
 *
 * Key design decisions:
 *     - The proposal followed to the letter, as asked by the user: an H1 (the only part it requires), a blockquote
 *       summary, free text without headings, then H2 file lists of `- [name](url): notes`, `## Optional` last for
 *       what an agent may skip. Every text is made one line and every link text escaped, so that no title, note or
 *       summary breaks the grammar (a property of `llms.test.ts`).
 *     - Each page linked by its Markdown version, as the proposal asks: `markdownUrlOf` appends `.md`, and
 *       `index.md` to a URL ending with a slash.
 *     - `llms-full.txt` is not in the proposal: an extra many tools read, kept apart so that `llms.txt` stays exactly
 *       its format. Each page follows a rule and its source, its own H1 kept.
 *     - A page's Markdown is its source with `<llm-exclude>` left out (over lines or within one, a code block in it
 *       too) and MDX's imports and exports dropped; code blocks and code spans kept as written, a tag shown in one
 *       never applied (a page documenting the tag once lost everything after its first mention). Written by the author, not rebuilt from the HTML: what an LLM reads is what the author wrote.
 *     - Plain spaces in `llms.txt` and `llms-full.txt`'s own texts (titles, summary, notes): a machine reads them,
 *       as the meta description. A page's Markdown keeps its typography: it is the content.
 *
 * Invariants (`llms.test.ts`): the spec's grammar whatever the texts hold (a property); the order of its parts; the
 * H1 alone when nothing else is given; plain spaces; `<llm-exclude>` and MDX's statements left out, code blocks
 * kept; the Markdown URLs.
 *
 * Limitations: a JSX component in the content stays as written (its rendering is the app's); a tag in a code block
 * or a code span is shown, never applied, but a code span spread over lines is not recognized as one.
 */
import { absoluteOn, plainSpaces } from './shared.js';
import type { Site } from './types.js';

/** A link of a file list: its name, its URL (a path on the site, or absolute), and what it holds. */
export interface LlmsLink {
  readonly title: string;
  readonly url: string;
  readonly notes?: string | undefined;
}

/** A file list, under its H2. */
export interface LlmsSection {
  readonly title: string;
  readonly links: readonly LlmsLink[];
}

/** What `llms.txt` holds, in the proposal's order. */
export interface LlmsInput {
  /** The H1: the project's or site's name. */
  readonly title: string;
  /** The blockquote: what the site is, in short. */
  readonly summary?: string | undefined;
  /** Free text after the summary, a paragraph each: never a heading. */
  readonly details?: readonly string[] | undefined;
  /** The file lists, each under its H2; an empty one is left out. */
  readonly sections: readonly LlmsSection[];
  /** The `## Optional` list: what an agent may skip when it needs a shorter context. */
  readonly optional?: readonly LlmsLink[] | undefined;
  readonly site: Site;
}

/** What `llms-full.txt` holds: the H1 and summary, then every page's Markdown. */
export interface LlmsFullInput {
  readonly title: string;
  readonly summary?: string | undefined;
  /** Each page's Markdown (`llmsMarkdownOf`) and its URL, in reading order. */
  readonly pages: readonly { readonly url: string; readonly markdown: string }[];
  readonly site: Site;
}

/** A text on one line, with plain spaces. */
const oneLine = (value: string): string => plainSpaces(value).replaceAll(/\s+/g, ' ').trim();

/** A link's text, its brackets and backslashes escaped. */
const linkText = (value: string): string => value.replaceAll(/[\\[\]]/g, (character) => `\\${character}`);

/** A URL as a Markdown link destination: no space nor parenthesis to end it early. */
const destination = (url: string): string =>
  url.replaceAll(/[\s()<>]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);

/**
 * A page's Markdown version, as llms.txt asks: `.md` appended, `index.md` after a slash.
 *
 * @param url - The page's URL, a path or absolute.
 * @returns Its Markdown version's URL.
 *
 * @example
 * markdownUrlOf('/docs/installation'); // '/docs/installation.md'
 * markdownUrlOf('/'); // '/index.md'
 */
export function markdownUrlOf(url: string): string {
  return url.endsWith('/') ? `${url}index.md` : `${url}.md`;
}

/** The H1, or a programming error: the proposal requires it. */
function heading(title: string): string {
  const name = oneLine(title);

  if (name === '') throw new Error('llms.txt needs a title: its H1, the site’s name, is the one part it requires.');

  return `# ${name}`;
}

/**
 * The `llms.txt` file, after the proposal.
 *
 * @param input - The site's name, summary and details, the file lists, the optional links, and the site (its origin
 *   makes every URL absolute).
 * @returns The file's text: the H1, the blockquote, the details, each non-empty file list under its H2, then
 *   `## Optional`; one line per text, link texts escaped, plain spaces.
 * @throws {Error} When the title is blank: the H1 is the one part the proposal requires.
 *
 * @example
 * llmsTxtOf({ title: 'figatellultimate', summary: 'Typed MDX content.', site,
 *   sections: [{ title: 'Docs', links: [{ title: 'CLI', url: '/docs/cli.md', notes: 'Its commands.' }] }] });
 */
export function llmsTxtOf(input: LlmsInput): string {
  const absolute = absoluteOn(input.site);
  const link = ({ title, url, notes }: LlmsLink): string => {
    const target = destination(absolute(url));
    const name = oneLine(title);
    const note = notes === undefined ? '' : oneLine(notes);

    return `- [${linkText(name === '' ? target : name)}](${target})${note === '' ? '' : `: ${note}`}`;
  };
  const list = (title: string, links: readonly LlmsLink[]): string[] => {
    const name = oneLine(title);

    if (name === '') throw new Error('An llms.txt file list needs a title: its H2.');

    return links.length === 0 ? [] : [[`## ${name}`, '', ...links.map(link)].join('\n')];
  };
  const summary = input.summary === undefined ? '' : oneLine(input.summary);
  // Free text, never a heading: a leading mark that would make it one, or another block, escaped.
  const details = (input.details ?? [])
    .map(oneLine)
    .flatMap((text) => (text === '' ? [] : [text.replace(/^[#>+*-]/, '\\$&')]));
  const blocks = [
    heading(input.title),
    ...(summary === '' ? [] : [`> ${summary}`]),
    ...details,
    ...input.sections.flatMap((section) => list(section.title, section.links)),
    ...list('Optional', input.optional ?? []),
  ];

  return `${blocks.join('\n\n')}\n`;
}

/** A code fence's opening: up to three spaces, then three backticks or tildes at least. */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const OPEN = '<llm-exclude>';
const CLOSE = '</llm-exclude>';

/**
 * Where a tag starts in a line, inline code skipped: a code span (a run of backticks, up to the next run of the same
 * length) shows a tag, never applies it.
 *
 * @param line - A line outside code blocks.
 * @param tag - The tag looked for.
 * @param from - Where to look from.
 * @returns The tag's index, or -1.
 */
function tagIndex(line: string, tag: string, from: number): number {
  let at = from;

  while (at < line.length) {
    if (line[at] === '`') {
      const run = /^`+/.exec(line.slice(at))?.[0] ?? '`';
      const closing = new RegExp(`(?<!\`)${run}(?!\`)`, 'g');

      closing.lastIndex = at + run.length;
      const end = closing.exec(line);

      // Unmatched backticks are text.
      at = end === null ? at + run.length : end.index + run.length;
      continue;
    }

    if (line.startsWith(tag, at)) return at;

    at += 1;
  }

  return -1;
}

/**
 * A page's Markdown for LLMs, from its MDX source.
 *
 * @param source - The page's source, its frontmatter already apart (e.g. content-collections' `content`).
 * @returns The source without what `<llm-exclude>` holds (over lines or within one, a code block in it too), without
 *   MDX's imports and exports, its blank lines collapsed; code blocks kept as written. One final newline.
 *
 * @example
 * llmsMarkdownOf('# Install\n\n<llm-exclude>For humans.</llm-exclude>\n\nRun it.'); // '# Install\n\nRun it.\n'
 */
export function llmsMarkdownOf(source: string): string {
  const out: string[] = [];
  let fence: { readonly mark: string; readonly length: number } | undefined;
  let excluding = false;
  let statement = false;
  const keep = (line: string): void => {
    // Blank lines collapsed, none at the start.
    if (line.trim() === '' && (out.length === 0 || out.at(-1)?.trim() === '')) return;

    out.push(line);
  };

  for (const line of source.replaceAll(/\r\n?/g, '\n').split('\n')) {
    if (fence !== undefined) {
      if (!excluding) out.push(line);

      if (new RegExp(`^ {0,3}${fence.mark}{${String(fence.length)},}\\s*$`).test(line)) fence = undefined;

      continue;
    }

    const opening = FENCE.exec(line);

    if (opening !== null) {
      const marks = opening[1] ?? '```';

      fence = { mark: marks[0] === '~' ? '~' : '`', length: marks.length };

      if (!excluding) keep(line);

      continue;
    }

    // MDX's imports and exports: a block of their own, up to its blank line.
    if (statement || (!excluding && /^(?:import|export)\s/.test(line))) {
      statement = line.trim() !== '';

      continue;
    }

    let kept = '';
    let at = 0;
    let tagged = false;

    for (;;) {
      const tag = excluding ? CLOSE : OPEN;
      const found = tagIndex(line, tag, at);

      if (found === -1) {
        if (!excluding) kept += line.slice(at);

        break;
      }

      tagged = true;

      if (!excluding) kept += line.slice(at, found);

      at = found + tag.length;
      excluding = !excluding;
    }

    // A line holding only tags, or only what they leave out, leaves nothing.
    if (tagged && kept.trim() === '') continue;

    if (!excluding || tagged) keep(kept);
  }

  while (out.at(-1)?.trim() === '') out.pop();

  return `${out.join('\n')}\n`;
}

/**
 * The `llms-full.txt` file: not in the llms.txt proposal, an extra many tools read.
 *
 * @param input - The site's name and summary, every page's Markdown and URL, and the site (its origin).
 * @returns The H1 and the blockquote, then each page after a rule and its absolute source.
 * @throws {Error} When the title is blank.
 *
 * @example
 * llmsFullOf({ title: 'figatellultimate', site, pages: [{ url: '/docs/cli.md', markdown: '# CLI\n' }] });
 */
export function llmsFullOf(input: LlmsFullInput): string {
  const absolute = absoluteOn(input.site);
  const summary = input.summary === undefined ? '' : oneLine(input.summary);

  return [
    heading(input.title),
    '',
    ...(summary === '' ? [] : [`> ${summary}`, '']),
    ...input.pages.flatMap((page) => ['---', '', `Source: ${absolute(page.url)}`, '', page.markdown.trimEnd(), '']),
  ].join('\n');
}
