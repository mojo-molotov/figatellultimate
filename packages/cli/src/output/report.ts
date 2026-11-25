/**
 * Diagnostic reports: one English template per code, saying where, why and how to fix; a problem repeated in many
 * files is summarized once (`report.test.ts`).
 */
import type { Diagnostic } from '@figatellultimate/core';
import type { MessageDiagnostic } from '@figatellultimate/messages';

/** Text styling: colors in a terminal, identity in plain output. */
export interface Styler {
  readonly bold: (text: string) => string;
  readonly dim: (text: string) => string;
  readonly red: (text: string) => string;
  readonly yellow: (text: string) => string;
  readonly cyan: (text: string) => string;
  readonly green: (text: string) => string;
}

const identity = (text: string): string => text;

/**
 * No styling: plain output (CI, pipes, `NO_COLOR`, tests).
 *
 */
export const PLAIN: Styler = {
  bold: identity,
  dim: identity,
  red: identity,
  yellow: identity,
  cyan: identity,
  green: identity,
};

/** What the diagnostic says (`message`) and how to fix it (`hint`): English only, one template per code. */
export interface Explanation {
  readonly message: string;
  readonly hint?: string | undefined;
}

const quote = (value: unknown): string => `"${String(value)}"`;
const didYouMean = (suggestions: readonly string[]): string | undefined =>
  suggestions.length === 0 ? undefined : `did you mean ${suggestions.map(quote).join(' or ')}?`;

/**
 * Plain-language explanation of every diagnostic code: where, why, how to fix.
 *
 * @param diagnostic - A content diagnostic.
 * @returns Its message and how to fix it, in English.
 */
export function explain(diagnostic: Diagnostic): Explanation {
  const d = diagnostic;

  switch (d.code) {
    case 'invalid-name':
      return {
        message: `${d.data.part === 'slug' ? 'file name' : `${d.data.part} folder`} ${quote(d.data.name)} breaks the naming rule (lowercase letters, digits and dashes)`,
        hint: d.suggestions[0] === undefined ? undefined : `rename it to ${quote(d.suggestions[0])}`,
      };
    case 'name-too-long':
      return {
        message: `${quote(d.data.name)} is ${String(d.data.length)} characters long`,
        hint: `shorten it to ${String(d.data.max)} characters at most`,
      };
    case 'unexpected-depth':
      return {
        message: `this file is not where the collection expects it (${String(d.data.folders)} folders)`,
        hint: `expected shape: ${d.data.expected}`,
      };
    case 'unknown-locale':
      return {
        message: `folder ${quote(d.data.folder)} is not a declared locale (${d.data.locales.join(', ')})`,
        hint:
          didYouMean(d.suggestions) ??
          'move the file out of it; drafts are marked with `draft: true`, not with a folder',
      };
    case 'missing-locale':
      return {
        message: 'this file is not in a locale folder (explicit notation)',
        hint: didYouMean(d.suggestions) ?? `put it under one of: ${d.data.locales.join(', ')}`,
      };
    case 'index-forbidden':
      return {
        message: `index.mdx is not allowed ${d.data.under === null ? 'at the collection root' : `directly under a ${d.data.under}`}`,
        hint: 'give the file a regular name',
      };
    case 'duplicate-default-locale':
      return {
        message: `the default locale ${quote(d.data.locale)} has two versions of this entry`,
        hint: `keep only one of this file and ${d.data.others.join(', ')}`,
      };
    case 'key-collision':
      return {
        message: `this file and ${d.data.others.join(', ')} are the same entry`,
        hint: 'rename or remove one of them',
      };
    case 'url-collision':
      return {
        message: `this file has the same URL (${d.data.url}) as ${d.data.others.map((o) => `${o.collection}/${o.sourcePath}`).join(', ')}`,
        hint: 'rename one of them',
      };
    case 'folder-page-collision':
      return {
        message: `this file has the URL of a folder page (${d.data.url}${d.data.level === null ? ', the collection’s own page' : `, a ${d.data.level} page`})`,
        hint:
          d.data.level === null
            ? 'remove this file, or `root` from the collection’s folderPages'
            : `remove this file, or "${d.data.level}" from the collection’s folderPages levels`,
      };
    case 'listing-index-collision':
      return {
        message: `this file's listing has its index at ${d.data.url}, the URL of a batch of ${d.data.folder}`,
        hint: 'rename its folders: `pages` followed by a number is where folder pages keep their batches',
      };
    case 'term-page-collision':
      return {
        message: `${d.sourcePath === null ? 'a folder page' : 'this file'} has the URL of the ${d.data.taxonomy} page of "${d.data.term}" (${d.data.url})`,
        hint: `move ${d.sourcePath === null ? 'the folder' : 'this file'}, or change \`pages.base\` of the ${d.data.taxonomy} taxonomy`,
      };
    case 'route-shadowed':
      return {
        message: `${d.sourcePath === null ? 'a page' : 'this file'} is served at ${d.data.url}, under the prefix of the ${quote(d.data.shadowedBy)} route: that route answers it, and does not know it (a 404)`,
        hint: `move ${d.sourcePath === null ? 'its folder' : 'this file'} out of ${quote(`/${d.data.shadowedBy}`)}, or give its collection another base; with one route serving every page, set \`splitRoutes: false\``,
      };
    case 'case-collision':
      return {
        message: `this file and ${d.data.others.join(', ')} only differ by case`,
        hint: "a case-insensitive file system (Windows' among them) sees them as one file: rename one",
      };
    case 'ugly-index':
      return {
        message: `a ${quote(d.data.folder)} folder sits next to this file`,
        hint: d.suggestions[0] === undefined ? undefined : `move the file to ${quote(d.suggestions[0])}`,
      };
    case 'unused-folder-image':
      return {
        message: `an image is declared for the folder "${d.data.path}", which holds no entry`,
        hint: didYouMean(d.suggestions) ?? 'fix the folder path in folderPages.images, or remove it',
      };
    case 'folder-image-fallback':
      return {
        message:
          d.data.fallback === 'newest-entry'
            ? `the folder "${d.data.path}" shows its newest entry's image: none declared in folderPages.images`
            : `the folder "${d.data.path}" shows no image: none declared in folderPages.images, and its entries have no image field`,
      };
    case 'unused-reservation':
      return {
        message: `the reservation ${quote(d.data.pattern)} matches no entry`,
        hint: didYouMean(d.suggestions) ?? 'remove it from `reserved`',
      };
    case 'unused-test-only':
      return {
        message: `the test-only pattern ${quote(d.data.pattern)} matches no entry`,
        hint: didYouMean(d.suggestions) ?? 'remove it from `testOnly`',
      };
    case 'missing-frontmatter-field':
      return {
        message: `required frontmatter field ${quote(d.data.field)} is missing`,
        hint: `add \`${d.data.field}:\` to the frontmatter`,
      };
    case 'invalid-frontmatter-field':
      return { message: `frontmatter field ${quote(d.data.field)}: ${d.data.message}` };
    case 'invalid-frontmatter':
      return { message: `invalid frontmatter: ${d.data.message}` };
    case 'unknown-inherit-locale':
      return {
        message: `\`inherit: ${d.data.locale}\` names a locale the site does not declare`,
        hint: didYouMean(d.suggestions) ?? 'name one of the declared locales, or remove `inherit:`',
      };
    case 'missing-inherit-source':
      return {
        message: `\`inherit: ${d.data.locale}\` has no version to take its fields from: no ${d.data.locale} version of ${quote(d.data.key)}`,
        hint: `add the ${d.data.locale} version, or write the fields in this file and remove \`inherit:\``,
      };
    case 'inherit-cycle':
      return {
        message: `the versions inherit from each other in a loop (${d.data.locales.join(' → ')}): no field to start from`,
        hint: 'remove `inherit:` from one of them',
      };
    case 'missing-shared-field':
      return {
        message: `required field ${quote(d.data.field)} is shared, but there is no ${d.data.locale} version of ${quote(d.data.key)} to take it from`,
        hint: `add the ${d.data.locale} version, or write \`${d.data.field}:\` in this file`,
      };
    case 'unreadable-source':
      return { message: `the content source cannot read this file: ${d.data.message}` };
    case 'missing-document':
      return {
        message: 'the content source produced no document for this file',
        hint: 'check its frontmatter syntax (an unclosed YAML value drops the file silently)',
      };
    case 'unknown-taxonomy-term':
      return {
        message: `${quote(d.data.term)} is not a known ${d.data.taxonomy} term (field ${quote(d.data.field)})`,
        hint: didYouMean(d.suggestions) ?? `declare it in the ${quote(d.data.taxonomy)} taxonomy`,
      };
    case 'duplicate-taxonomy-term':
      return { message: `${quote(d.data.term)} appears twice in ${quote(d.data.field)}`, hint: 'remove the duplicate' };
    case 'invalid-taxonomy-reference':
      return {
        message: `field ${quote(d.data.field)} must be a ${d.data.taxonomy} term or a list of them`,
        hint: `e.g. \`${d.data.field}: [a, b]\``,
      };
    case 'unknown-term-content':
      return {
        message: `${quote(d.data.term)} is not a ${d.data.taxonomy} term: this file is a term's content, named after it`,
        hint:
          didYouMean(d.suggestions) ??
          `rename it after a term, or declare ${quote(d.data.term)} in the ${quote(d.data.taxonomy)} taxonomy`,
      };
    case 'invalid-draft-flag':
      return { message: `field ${quote(d.data.field)} must be true or false` };
    case 'invalid-metadata-field':
      return {
        message: `field ${quote(d.data.field)} is read as site metadata and must be ${METADATA_EXPECTATIONS[d.data.expected]}`,
        hint: 'fix the frontmatter, or change `metadata` in the collection',
      };
    case 'cannot-list-directory':
      return {
        message: `cannot list ${quote(d.data.directory)} (${d.data.reason})`,
        hint: 'check the collection directory in the content source config',
      };
    case 'missing-image':
      return {
        message: `${quote(d.data.image)}${d.data.field === null ? ', an image of the text,' : ` (${d.data.field})`} is not in ${quote(d.data.publicDirectory)}: the page would show a broken image`,
        hint:
          didYouMean(d.suggestions) ??
          `add the file to ${quote(d.data.publicDirectory)}, or fix the path (from the site's root, e.g. /covers/news.jpeg)`,
      };
  }
}

const isContentKey = (key: string): boolean => key.startsWith('content.') || key.startsWith('taxonomies.');

/**
 * Plain-language explanation of every message diagnostic code.
 *
 * @param diagnostic - A message diagnostic.
 * @returns Its message and how to fix it, in English.
 */
export function explainMessage(diagnostic: MessageDiagnostic): Explanation {
  const d = diagnostic;
  const key = quote(d.key ?? '');

  switch (d.code) {
    case 'missing-message-module':
      return {
        message: `no messages for the locale ${quote(d.data.locale)}`,
        hint: `create ${d.file} with the default locale's keys`,
      };
    case 'unknown-message-module':
      return {
        message: `${quote(d.data.name)} is not a declared locale (${d.data.locales.join(', ')})`,
        hint: didYouMean(d.suggestions) ?? 'declare the locale in defineLocales, or remove the file',
      };
    case 'unreadable-message-module':
      return {
        message: `this module cannot be loaded: ${d.data.message}`,
        hint: 'message modules run in Node, like the config: erasable TypeScript only (no enum, no namespace)',
      };
    case 'invalid-message-module':
      return d.key === null
        ? { message: `the default export must be an object of messages (found ${d.data.found})` }
        : { message: `${key} must be a text or a group of messages (found ${d.data.found})` };
    case 'missing-message':
      return {
        message: `${key} is missing (${d.data.expected === 'text' ? 'a text' : 'a group of messages'})`,
        hint: isContentKey(d.key ?? '')
          ? 'the content requires it in every locale: translate the folder or term'
          : 'every locale needs the keys of the default locale',
      };
    case 'unknown-message':
      return {
        message: `${key} is ${d.data.against === 'content' ? 'not required by the content' : 'not in the default locale'}`,
        hint:
          didYouMean(d.suggestions) ??
          (d.data.against === 'content'
            ? 'remove it (no such folder or term)'
            : 'add it to the default locale first, or remove it'),
      };
    case 'unused-message':
      return {
        message: `${key} is not used by the app`,
        hint: 'remove it from the schema and every locale, or keep it: // figatellultimate-keep: <why>, above it in the schema',
      };
    case 'invalid-message-syntax':
      return { message: `${key} is not valid ICU (${d.data.problem} at character ${String(d.data.offset)})` };
    case 'message-arguments-mismatch':
      return {
        message: `${key} takes ${d.data.found.join(', ') || 'no argument'} instead of ${d.data.expected.join(', ') || 'no argument'}`,
        hint: 'use the same arguments as the default locale',
      };
    case 'missing-plural-other':
      return {
        message: `${key}: the plural of {${d.data.argument}} has no \`other\` case`,
        hint: 'add `other {…}`: ICU requires it',
      };
    case 'missing-plural-category':
      return {
        message: `${key}: the plural of {${d.data.argument}} lacks ${d.data.categories.join(', ')} for this locale`,
        hint: 'add these cases, unless such numbers cannot occur here',
      };
    case 'unknown-navigation-label':
      return {
        message: `the navigation label ${key} of ${quote(d.data.collection)} is not a message of this locale`,
        hint: didYouMean(d.suggestions) ?? 'add it to the messages, or change the label in figatellultimate.config.ts',
      };
  }
}

/** Where a diagnostic is, for humans: the collection directory + source path when known. */
/** How each kind of metadata field is described to the author. */
const METADATA_EXPECTATIONS = {
  text: 'a text',
  'list of texts': 'a list of texts',
  number: 'a number, e.g. 2',
  'robots directives': 'robots directives, e.g. "noindex" or "noindex, nofollow"',
  'absolute URL': 'an absolute URL, e.g. "https://example.com/page"',
} as const;

function locationOf(d: Diagnostic, directories: Readonly<Record<string, string>>): string {
  const directory = directories[d.collection];

  if (d.sourcePath === null) return `${d.collection} (collection)`;

  return directory === undefined ? `${d.collection}/${d.sourcePath}` : `${directory}/${d.sourcePath}`;
}

/** What the report reads of any diagnostic, content or message. */
type Reported = Pick<Diagnostic | MessageDiagnostic, 'code' | 'severity'>;

/** Minimum number of files sharing the same problem for it to be summarized once. */
const GROUPING_THRESHOLD = 3;

/**
 * Report lines: identical problems found in many files are summarized once with the list of files; the others are
 * grouped by file. Deterministic (input order).
 *
 * @param diagnostics - The content diagnostics.
 * @param directories - Each collection's directory, to show project-relative paths.
 * @param style - Colors in a terminal, none otherwise.
 * @param messages - The message diagnostics and the messages folder.
 * @returns The report's lines.
 */
export function reportLines(
  diagnostics: readonly Diagnostic[],
  directories: Readonly<Record<string, string>>,
  style: Styler = PLAIN,
  messages?: { readonly diagnostics: readonly MessageDiagnostic[]; readonly directory: string },
): string[] {
  const keyed: { d: Reported; explanation: Explanation; location: string }[] = [
    ...diagnostics.map((d) => ({ d, explanation: explain(d), location: locationOf(d, directories) })),
    ...(messages?.diagnostics ?? []).map((d) => ({
      d,
      explanation: explainMessage(d),
      location: `${messages?.directory ?? 'messages'}/${d.file}`,
    })),
  ];
  const groups = new Map<string, typeof keyed>();

  for (const item of keyed) {
    const key = `${item.d.code}\u0000${item.explanation.message}\u0000${item.explanation.hint ?? ''}`;

    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const summarized = new Set([...groups.values()].filter((g) => g.length >= GROUPING_THRESHOLD).flat());
  const mark = (d: Reported): string =>
    d.severity === 'error' ? style.red('✖') : d.severity === 'warning' ? style.yellow('▲') : style.cyan('ℹ');
  const lines: string[] = [];

  for (const group of groups.values()) {
    const first = group[0];

    if (first === undefined || group.length < GROUPING_THRESHOLD) continue;

    lines.push(
      `${mark(first.d)} ${style.bold(`${String(group.length)} files`)}: ${first.explanation.message}  ${style.dim(`[${first.d.code}]`)}`,
    );

    if (first.explanation.hint !== undefined) lines.push(`    ${style.cyan('→')} ${first.explanation.hint}`);

    for (const item of group) lines.push(`    ${style.dim('·')} ${item.location}`);
  }

  let previous: string | undefined;

  for (const item of keyed) {
    if (summarized.has(item)) continue;

    if (item.location !== previous) lines.push(style.bold(item.location));

    previous = item.location;
    lines.push(`  ${mark(item.d)} ${item.explanation.message}  ${style.dim(`[${item.d.code}]`)}`);

    if (item.explanation.hint !== undefined) lines.push(`    ${style.cyan('→')} ${item.explanation.hint}`);
  }

  return lines;
}

/**
 * How many errors and warnings a run found.
 *
 */
export interface Counts {
  readonly errors: number;
  readonly warnings: number;
  /** What the build chose on its own: never a problem. */
  readonly infos: number;
  readonly files: number;
}

/**
 * Counts a run's errors and warnings.
 *
 * @param diagnostics - The content diagnostics.
 * @param messageDiagnostics - The message diagnostics.
 * @returns The errors and warnings counted.
 */
export function countDiagnostics(
  diagnostics: readonly Diagnostic[],
  messageDiagnostics: readonly MessageDiagnostic[] = [],
): Counts {
  const all: readonly Reported[] = [...diagnostics, ...messageDiagnostics];

  return {
    errors: all.filter((d) => d.severity === 'error').length,
    warnings: all.filter((d) => d.severity === 'warning').length,
    infos: all.filter((d) => d.severity === 'info').length,
    files: new Set([
      ...diagnostics.map((d) => `${d.collection}\u0000${d.sourcePath ?? ''}`),
      ...messageDiagnostics.map((d) => `\u0000messages\u0000${d.file}`),
    ]).size,
  };
}
