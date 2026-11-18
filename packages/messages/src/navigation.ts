/**
 * The navigation's labels, checked against the reference messages at build time.
 */
import { suggest, type NavigationItem } from '@figatellu/core';

import type { UnknownNavigationLabelDiagnostic } from './diagnostics.js';
import type { MessagesModel, ShapeNode } from './model.js';

/** Every message key of a reference shape, as dot paths. */
function messageKeys(node: ShapeNode, path: readonly string[] = []): string[] {
  if (node.kind === 'message') return [path.join('.')];

  return Object.entries(node.children).flatMap(([key, child]) => messageKeys(child, [...path, key]));
}

/**
 * Checks the `navigation` labels the config declares: a navbar never shows a raw key.
 *
 * @param model - The analyzed messages.
 * @param navigation - The config's navigation items.
 * @param defaultLocale - The reference locale.
 * @returns One diagnostic per label that is not a message of the reference locale, with suggestions.
 *
 * @example
 * checkNavigationLabels(model, [{ collection: 'blog', depth: 2, label: 'nav.blgo' }], 'fr'); // did you mean nav.blog
 */
export function checkNavigationLabels(
  model: MessagesModel,
  navigation: readonly NavigationItem[],
  defaultLocale: string,
): readonly UnknownNavigationLabelDiagnostic[] {
  const keys = messageKeys(model.reference);
  const known = new Set(keys);

  return navigation.flatMap((item): UnknownNavigationLabelDiagnostic[] =>
    item.label === undefined || known.has(item.label)
      ? []
      : [
          {
            code: 'unknown-navigation-label',
            severity: 'error',
            file: model.files[defaultLocale] ?? `${defaultLocale}.ts`,
            key: item.label,
            data: { collection: item.collection },
            suggestions: suggest(item.label, keys),
          },
        ],
  );
}
