/**
 * `navigation/index`: one navigation tree per locale.
 */
import type { Entry, FigatellultimateConfig, FolderPage } from '@figatellultimate/core';
import { VariableDeclarationKind, type Project } from 'ts-morph';

import { literal } from '../model.js';
import { navigationTrees } from '../navigation.js';
import { render, type GeneratedFile } from '../render.js';

/**
 * `navigation/index.ts`: one tree per locale, from the declared collections. Section labels are message
 * keys, typed by the generated `MessageKey` when the project declares messages.
 *
 * @param project - The in-memory ts-morph project.
 * @param config - The config, its `navigation` declaration included.
 * @param entries - The kept entries.
 * @param folders - The folder pages, linked from their sections.
 * @returns The generated file(s), built in memory; nothing is written. None without a `navigation` declaration.
 */
export function navigationFile(
  project: Project,
  config: FigatellultimateConfig,
  entries: readonly Entry[],
  folders: readonly FolderPage[] = [],
): GeneratedFile[] {
  if (config.navigation === undefined) return [];

  const trees = navigationTrees({
    locales: config.locales,
    collections: config.collections,
    urls: config.urls,
    navigation: config.navigation,
    entries,
    folders,
  });

  return render(project, 'navigation/index.ts', 'module', (file) => {
    file.addImportDeclaration({ isTypeOnly: true, moduleSpecifier: '../locales/index.js', namedImports: ['Locale'] });

    if (config.messages === undefined) {
      file.addTypeAlias({ name: 'MessageKey', type: 'string' });
    } else {
      file.addImportDeclaration({
        isTypeOnly: true,
        moduleSpecifier: '../messages/index.js',
        namedImports: ['MessageKey'],
      });
    }

    file.addTypeAlias({
      name: 'NavigationNode',
      isExported: true,
      docs: ['An entry link, or a section: a folder (its content message) or a labelled collection.'],
      type: `{ readonly kind: 'entry'; readonly url: string; readonly title: string; readonly key: string } | { readonly kind: 'section'; readonly label: MessageKey; readonly url?: string; readonly menu?: false; readonly children: readonly NavigationNode[] }`,
    });
    file.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: 'navigation',
          type: 'Readonly<Record<Locale, readonly NavigationNode[]>>',
          initializer: literal(trees),
        },
      ],
    });
    file.addFunction({
      name: 'navigationOf',
      isExported: true,
      docs: ['The navigation of a locale: what exists in it, in the declared order.'],
      parameters: [{ name: 'locale', type: 'Locale' }],
      returnType: 'readonly NavigationNode[]',
      statements: 'return navigation[locale];',
    });
  });
}
