/**
 * What a site exposes to LLMs, after the llms.txt proposal (https://llmstxt.org): the `llms.txt` file, each page's
 * Markdown, and `llms-full.txt`, every page in one file.
 *
 *     the app's route ──> llmsTxtOf({ title, summary, details, sections, optional })   /llms.txt
 *                     ──> each page's Markdown (`@figatellultimate/content-collections/llms`), at markdownUrlOf
 *                     ──> llmsFullOf({ title, summary, pages })                         /llms-full.txt
 *
 * Key design decisions:
 *     - The proposal followed to the letter: an H1 (the only part it requires), a blockquote
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
import { absoluteOn, oneLine } from './shared.js';
import type { MetadataFields, MountedUrl, Site } from './types.js';

/** An exposed page: its URL, title, optional description and Markdown for LLMs. */
export interface ExposedPage {
  readonly url: string;
  readonly title: string;
  readonly description?: string | undefined;
  readonly markdown: string;
}

/** A mounted entry returned by `find` for `exposedPagesOf`. */
export interface ExposedEntryLookup {
  readonly kind: 'entry';
  readonly collection: string;
  readonly entry: {
    readonly url: string;
    readonly data: object;
    readonly body: string;
  };
}

/** Options of `exposedPagesOf`. */
export interface ExposedPagesOptions {
  /** Every mounted URL (generated `mountedUrls`). */
  readonly urls: readonly MountedUrl[];
  /** Locale to collect exposed pages for. */
  readonly locale: string;
  /** Looks up a mounted entry by URL (generated `findByUrl`). */
  readonly find: (url: string) => Promise<ExposedEntryLookup | { readonly kind: string } | undefined>;
  /** Metadata field names per collection (generated `metadataFields`). */
  readonly fields: Readonly<Record<string, MetadataFields | undefined>>;
  /** Turns an entry's raw MDX body into LLM Markdown (`llmsMarkdownOf` of `@figatellultimate/content-collections/llms`). */
  readonly toMarkdown: (body: string) => string;
}

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

/** A link's text, its brackets and backslashes escaped. */
const linkText = (value: string): string => value.replaceAll(/[\\[\]]/g, (character) => `\\${character}`);

/** A URL as a Markdown link destination: no space nor parenthesis to end it early. */
const destination = (url: string): string =>
  url.replaceAll(/[\s()<>]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);

/**
 * Whether a URL is exposed to LLMs in `mountedUrls`.
 *
 * @param urls - Every mounted URL (generated `mountedUrls`).
 * @param url - A page's URL.
 * @returns `true` when the URL is mounted with `llms: true`.
 *
 * @example
 * isLlmsExposed(mountedUrls, '/docs/installation'); // true
 */
export function isLlmsExposed(urls: readonly MountedUrl[], url: string): boolean {
  return urls.some((item) => item.url === url && item.llms === true);
}

/** A frontmatter field, read by the name its collection declares (`metadataFields`). */
const fieldOf = (data: object, name: string | undefined): unknown =>
  name === undefined ? undefined : Reflect.get(data, name);

/**
 * Collects a locale's LLM-exposed pages in their reading order (the collection's `order` field, then by title).
 *
 * @param options - Mounted URLs, target locale, entry loader, collection metadata fields and Markdown converter.
 * @returns Frozen exposed pages with their title, optional description and Markdown.
 *
 * @example
 * const pages = await exposedPagesOf({ urls: mountedUrls, locale: 'fr', find: findByUrl, fields: metadataFields, toMarkdown: llmsMarkdownOf });
 */
export async function exposedPagesOf(options: ExposedPagesOptions): Promise<readonly ExposedPage[]> {
  const { urls, locale, find, fields, toMarkdown } = options;
  const found = await Promise.all(
    urls.filter((item) => item.llms === true && item.locale === locale).map((item) => find(item.url)),
  );
  const pages = found.flatMap((page) => {
    if (page === undefined || page.kind !== 'entry' || !('collection' in page) || !('entry' in page)) return [];

    const collectionFields = fields[page.collection];
    const title = fieldOf(page.entry.data, collectionFields?.title);
    const description = fieldOf(page.entry.data, collectionFields?.description);
    const order = fieldOf(page.entry.data, collectionFields?.order);

    return [
      {
        url: page.entry.url,
        title: typeof title === 'string' ? title : page.entry.url,
        ...(typeof description === 'string' ? { description } : {}),
        order: typeof order === 'number' ? order : Number.POSITIVE_INFINITY,
        markdown: toMarkdown(page.entry.body),
      },
    ];
  });

  return Object.freeze(
    pages
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, locale))
      .map((page) =>
        Object.freeze({
          url: page.url,
          title: page.title,
          ...(page.description === undefined ? {} : { description: page.description }),
          markdown: page.markdown,
        }),
      ),
  );
}

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
