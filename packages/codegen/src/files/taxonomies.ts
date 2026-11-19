/**
 * `taxonomies/index`: each taxonomy's terms and pure data, so that an app never imports the config at runtime.
 */
import type { FigatellultimateConfig } from '@figatellultimate/core';
import { VariableDeclarationKind, type Project } from 'ts-morph';

import { literal } from '../model.js';
import { render, type GeneratedFile } from '../render.js';

/** The exact, readonly type of a JSON value: what the declaration of pure data says. */
function typeOf(value: unknown): string {
  if (value === null) return 'null';

  if (Array.isArray(value)) return `readonly [${value.map(typeOf).join(', ')}]`;

  if (typeof value === 'object') {
    const fields = Object.entries(value).map(([key, field]) => `readonly ${literal(key)}: ${typeOf(field)}`);

    return `{ ${fields.join('; ')} }`;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return literal(value);

  return 'unknown';
}

/**
 * `taxonomies/index.ts`: each taxonomy's terms and pure data (an author's avatar…), so that an app never imports the
 * config at runtime (it loads Node and the delegated tool), like `metadataFields`. Emitted when there is one.
 *
 * @param project - The in-memory ts-morph project.
 * @param config - The config and its taxonomies.
 * @returns The generated file(s), built in memory; nothing is written. None without a taxonomy.
 */
export function taxonomiesFile(project: Project, config: FigatellultimateConfig): GeneratedFile[] {
  const taxonomies = config.taxonomies ?? {};

  if (Object.keys(taxonomies).length === 0) return [];

  const value = Object.fromEntries(
    Object.entries(taxonomies).map(([name, taxonomy]) => [name, { terms: taxonomy.terms, data: taxonomy.data }]),
  );

  return render(project, 'taxonomies/index.ts', 'module', (file) => {
    file.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      isExported: true,
      docs: ["Every taxonomy's terms and data, as declared: pure data, never components."],
      declarations: [{ name: 'taxonomies', type: typeOf(value), initializer: literal(value) }],
    });
  });
}
