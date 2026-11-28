/**
 * The app's messages nothing uses: the keys of the reference that no code reaches, as warnings, so that dead texts
 * stop being translated in every locale.
 *
 *     reference keys ──> minus the content's and the taxonomies' (the skeleton's)
 *                    ──> minus the used ones (the CLI reads them from the app's typed calls)
 *                    ──> minus the kept ones (a marker in the schema) and the navigation's labels ──> warnings
 *
 * Key design decisions:
 *     - Only the app's own keys: the content's and the taxonomies' are required by the content itself, and one left by
 *       a removed folder is already an error (`unknown-message`).
 *     - Pure: which keys are used is the CLI's to find (`packages/cli/src/pipeline/usage.ts`), from the types of the
 *       app's calls; this module only compares.
 *     - A kept key keeps its whole group: a marker on `ui.legacy` keeps `ui.legacy.a` and `ui.legacy.b`, never
 *       `ui.legacyNotes` (whole segments only).
 *     - A warning, never an error: a dead text breaks nothing, it costs a translation in every locale.
 *
 * Invariants (`__tests__/unused.test.ts`): the content's keys are never reported; used, kept and navigation keys are
 * left out, a kept group with its messages.
 */
import type { NavigationItem } from '@figatellultimate/core';

import type { UnusedMessageDiagnostic } from './diagnostics.js';
import type { MessagesModel, ShapeNode } from './model.js';

/** The top-level groups the skeleton fills from the content: never the app's to remove. */
const CONTENT_GROUPS: readonly string[] = ['content', 'taxonomies'];

function keysOf(node: ShapeNode, path: readonly string[]): string[] {
  if (node.kind === 'message') return [path.join('.')];

  return Object.entries(node.children).flatMap(([key, child]) => keysOf(child, [...path, key]));
}

/**
 * Every message of the reference, as dot paths, the content's included: the keys an app's calls may name.
 *
 * @param model - The analyzed messages.
 * @returns The keys, in the reference's order.
 *
 * @example
 * referenceKeys(model); // ['content.blog.news.$.title', 'nav.blog', 'ui.title', …]
 */
export function referenceKeys(model: MessagesModel): readonly string[] {
  return keysOf(model.reference, []);
}

/** Whether a key is a kept key, or a message of a kept group. */
const isKept = (key: string, kept: readonly string[]): boolean =>
  kept.some((prefix) => key === prefix || key.startsWith(`${prefix}.`));

/**
 * The app's messages nothing uses.
 *
 * @param input - The analyzed messages, the default locale, the keys the app's code uses, the kept keys or groups,
 *   and the navigation (its labels are used by the generated navbar).
 * @returns One warning per unused message of the app, located in the default locale's module, sorted by key.
 *
 * @example
 * findUnusedMessages({ model, defaultLocale: 'fr', used: new Set(['ui.title']), kept: ['ui.legacy'], navigation });
 * // [{ code: 'unused-message', key: 'ui.dead', … }]
 */
export function findUnusedMessages(input: {
  readonly model: MessagesModel;
  readonly defaultLocale: string;
  readonly used: ReadonlySet<string>;
  readonly kept: readonly string[];
  readonly navigation: readonly NavigationItem[];
}): readonly UnusedMessageDiagnostic[] {
  const labels = new Set(input.navigation.flatMap((item) => (item.label === undefined ? [] : [item.label])));
  const file = input.model.files[input.defaultLocale] ?? `${input.defaultLocale}.ts`;

  return referenceKeys(input.model)
    .filter((key) => !CONTENT_GROUPS.includes(key.split('.')[0] ?? ''))
    .filter((key) => !input.used.has(key) && !labels.has(key) && !isKept(key, input.kept))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((key) => ({
      code: 'unused-message',
      severity: 'warning',
      file,
      key,
      data: { locale: input.defaultLocale },
      suggestions: [],
    }));
}
