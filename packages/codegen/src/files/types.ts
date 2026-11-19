/**
 * `<collection>/types`: the data type (from the content source), the lookup table, the validated query, the index
 * item and entry types.
 */
import { posix } from 'node:path';

import type { FigatellultimateConfig } from '@figatellultimate/core';
import { Writers, type Project } from 'ts-morph';

import { literal, lookupTree, type CollectionModel } from '../model.js';
import { render, type GeneratedFile } from '../render.js';
import { property, treeProperties } from './type-builders.js';

/**
 * `<collection>/types.ts`: data type, lookup table, validated query, index item and entry types.
 *
 * @param project - The in-memory ts-morph project.
 * @param model - The collection.
 * @param config - The config, for the content source's type imports.
 * @param outputDirectory - The absolute output folder, to compute relative imports.
 * @returns The generated file(s), built in memory; nothing is written.
 */
export function typesFile(
  project: Project,
  model: CollectionModel,
  config: FigatellultimateConfig,
  outputDirectory: string,
): GeneratedFile[] {
  const { name, type, parameters, levels } = model;
  const typeSource = config.source.typeSource?.(name, posix.join(outputDirectory, name));
  const data = `${type}Data`;
  // Each reference field's terms: checked against its taxonomy at build time, so typed by its terms.
  const terms = Writers.objectType({
    properties: Object.entries(model.collection.references).map(([field, taxonomy]) => {
      const declared = config.taxonomies?.[taxonomy]?.terms ?? [];

      return property(literal(field), `readonly (${declared.map(literal).join(' | ') || 'never'})[]`);
    }),
  });

  return render(project, `${name}/types.ts`, 'types', (file) => {
    for (const imported of typeSource?.imports ?? []) {
      file.addImportDeclaration({
        isTypeOnly: true,
        moduleSpecifier: imported.moduleSpecifier,
        ...(imported.defaultImport === undefined ? {} : { defaultImport: imported.defaultImport }),
        ...(imported.namedImports === undefined ? {} : { namedImports: [...imported.namedImports] }),
      });
    }

    file.addImportDeclaration({ isTypeOnly: true, moduleSpecifier: '../locales/index.js', namedImports: ['Locale'] });

    file.addTypeAlias({
      name: data,
      isExported: true,
      docs: [`Frontmatter data of a ${type} (from the content source's schema when it provides a type).`],
      type: typeSource?.type ?? 'Readonly<Record<string, unknown>>',
    });
    file.addInterface({
      name: `${type}Tree`,
      isExported: true,
      docs: [`Every existing ${type}: ${levels.join(' → ')} → locales in which it exists.`],
      properties: treeProperties(lookupTree(model), config.locales.list),
    });
    file.addTypeAlias({
      name: `Validated${type}Query`,
      isExported: true,
      docs: [`A query checked at runtime by \`is${type}Query\` (from untrusted strings).`],
      type: Writers.intersectionType(
        Writers.objectType({ properties: parameters.map((p) => property(p, 'string')) }),
        Writers.objectType({ properties: [property("'~validated'", literal(name))] }),
      ),
    });
    file.addInterface({
      name: `${type}IndexItem`,
      isExported: true,
      docs: ['Light index item: everything but the data and the body, which are loaded lazily.'],
      properties: [
        property('key', 'string'),
        property('locale', 'Locale'),
        property('route', 'string'),
        property('url', 'string'),
        property('alternates', 'Readonly<Partial<Record<Locale, string>>>'),
        property('segments', 'Readonly<Record<string, string>>'),
        property('slug', 'string'),
        property('terms', terms),
        property('draft', 'boolean'),
        property('reserved', 'boolean'),
        property('query', 'Readonly<Record<string, string>>'),
        property('load', `() => Promise<{ readonly data: ${data}; readonly body: string }>`),
      ],
    });
    file.addTypeAlias({
      name: type,
      isExported: true,
      type: Writers.intersectionType(
        `Omit<${type}IndexItem, 'load'>`,
        Writers.objectType({ properties: [property('data', data), property('body', 'string')] }),
      ),
    });
  });
}
