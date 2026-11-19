/**
 * `locales/index`: the locale union, the default locale, the list and each locale's metadata (label, direction).
 */
import type { FigatellultimateConfig } from '@figatellultimate/core';
import { VariableDeclarationKind, type Project } from 'ts-morph';

import { literal } from '../model.js';
import { render, type GeneratedFile } from '../render.js';
import { property, union } from './type-builders.js';

/**
 * `locales/index.ts`: the locale union, the default locale, the list and every locale's metadata.
 *
 * @param project - The in-memory ts-morph project.
 * @param config - The config and its locales.
 * @returns The generated file(s), built in memory; nothing is written.
 */
export function localesFile(project: Project, config: FigatellultimateConfig): GeneratedFile[] {
  const { list, default: defaultLocale } = config.locales;

  return render(project, 'locales/index.ts', 'module', (file) => {
    file.addTypeAlias({ name: 'Locale', isExported: true, type: union(list.map(literal)) });
    file.addTypeAlias({ name: 'DefaultLocale', isExported: true, type: literal(defaultLocale) });
    file.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      isExported: true,
      declarations: [{ name: 'locales', type: 'readonly Locale[]', initializer: literal(list) }],
    });
    file.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      isExported: true,
      declarations: [{ name: 'defaultLocale', type: 'DefaultLocale', initializer: literal(defaultLocale) }],
    });
    file.addInterface({
      name: 'LocaleInfo',
      isExported: true,
      properties: [property('label', 'string'), property('dir', "'ltr' | 'rtl'")],
    });
    file.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      isExported: true,
      docs: ['Label and writing direction of every locale, as declared.'],
      declarations: [
        { name: 'localeInfo', type: 'Readonly<Record<Locale, LocaleInfo>>', initializer: literal(config.locales.info) },
      ],
    });
  });
}
