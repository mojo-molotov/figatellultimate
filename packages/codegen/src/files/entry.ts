/**
 * `<collection>/entries/<locale>/<key>.js`: one entry's data and body, plain JavaScript, imported lazily by its
 * index.
 */
import type { Entry } from '@figatellultimate/core';
import { VariableDeclarationKind, type Project } from 'ts-morph';

import { entryModule, literal, type CollectionModel } from '../model.js';
import { render, type GeneratedFile } from '../render.js';

/**
 * `<collection>/entries/<locale>/<key>.js`: one entry's data and body, imported lazily by the index. Plain
 * JavaScript, no declaration: the index's types describe it, and an app's typecheck never reaches it.
 *
 * @param project - The in-memory ts-morph project.
 * @param model - The entry's collection.
 * @param entry - The entry.
 * @returns The generated file(s), built in memory; nothing is written.
 */
export function entryFile(project: Project, model: CollectionModel, entry: Entry): GeneratedFile[] {
  return render(project, `${model.name}/${entryModule(entry)}.ts`, 'data', (file) => {
    file.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      isExported: true,
      declarations: [{ name: 'data', initializer: literal(entry.data) }],
    });
    file.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      isExported: true,
      declarations: [{ name: 'body', initializer: literal(entry.body) }],
    });
  });
}
