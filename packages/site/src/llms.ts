/**
 * What a site exposes to LLMs, after the llms.txt proposal (https://llmstxt.org): the `llms.txt` file, each page's
 * Markdown, and `llms-full.txt`, every page in one file.
 *
 *     the app's route ──> llmsTxtOf({ title, summary, details, sections, optional })   /llms.txt
 *                     ──> each page's Markdown (`@figatellultimate/content-collections/llms`), at markdownUrlOf
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
 *     - A page's Markdown is written by the MDX tool's adapter (`@figatellultimate/content-collections/llms`, which
 *       parses MDX): these helpers have no dependency.
 *     - Plain spaces in `llms.txt` and `llms-full.txt`'s own texts (titles, summary, notes): a machine reads them,
 *       as the meta description. A page's Markdown keeps its typography: it is the content.
 *
 * Invariants (`llms.test.ts`): the spec's grammar whatever the texts hold (a property); the order of its parts; the
 * H1 alone when nothing else is given; plain spaces; the Markdown URLs.
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
  /**
   * Each page's Markdown (`llmsMarkdownOf` of `@figatellultimate/content-collections/llms`) and its URL, in reading
   * order.
   */
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
