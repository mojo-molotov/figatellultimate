/**
 * The list of generated files: one model per collection, then every module derived from the models, the folder and
 * term pages, and the analyzed messages.
 */
import { createUrlBuilder, folderPagesOf, termPagesOf, type Assembly, type FigatelluConfig } from '@figatellu/core';
import type { MessagesModel } from '@figatellu/messages';

import { entryFile } from './files/entry.js';
import { folderData } from './folders.js';
import { pageSeo } from './seo.js';
import { indexFile } from './files/index-module.js';
import { localesFile } from './files/locales.js';
import { navigationFile } from './files/navigation.js';
import { taxonomiesFile } from './files/taxonomies.js';
import { termData, termsFile } from './files/terms.js';
import { messageIndexFile, messageTypesFile } from './files/messages.js';
import { urlsFile } from './files/urls.js';
import { collectionModel, compareText, type CollectionModel } from './model.js';
import { createProject, type GeneratedFile } from './render.js';
import { typesFile } from './files/types.js';

/**
 * What the code generator needs: the config, the assembled content, the output folder and the analyzed messages.
 *
 */
export interface EmitInput {
  readonly config: FigatelluConfig;
  readonly assembly: Assembly;
  /** Absolute output folder: only used to let the content source compute relative type imports; never emitted. */
  readonly outputDirectory: string;
  /** The analyzed messages: `messages/` is emitted when the config declares them and they are given. */
  readonly messages?: MessagesModel | undefined;
}

/**
 * Pure codegen: the files of `.figatellu/`, built as ts-morph declarations in memory, sorted by path and
 * byte-identical for the same input.
 *
 * @param input - The config, the assembly (`loadContent`), the absolute output folder (only to compute relative
 *   type imports, never emitted), and the analyzed messages when the config declares them.
 * @returns Every file of `.figatellu/`, sorted by path and byte-identical for the same input; pass them to a
 *   writer.
 *
 * @example
 * const result = await createNodeFileWriter(out).commit(emit({ config, assembly, outputDirectory: out, messages }));
 */
export function* emit(input: EmitInput): Generator<GeneratedFile, void, undefined> {
  const { config, assembly, outputDirectory } = input;
  const project = createProject();
  const urls = createUrlBuilder(config.locales, config.urls);
  const files: GeneratedFile[] = [...localesFile(project, config)];
  const models: CollectionModel[] = [];
  // Folder pages: from the kept entries, like everything else the build mounts.
  const folders = folderPagesOf({
    locales: config.locales,
    collections: config.collections,
    urls,
    entries: assembly.entries.map((entry) => entry.descriptor),
  });
  const messageKeys = config.messages !== undefined && input.messages !== undefined;

  for (const [name, collection] of Object.entries(config.collections)) {
    const model = collectionModel(
      name,
      collection,
      assembly.entries.filter((e) => e.descriptor.collection === name),
    );

    models.push(model);
    files.push(
      ...typesFile(project, model, config, outputDirectory),
      ...indexFile(
        project,
        model,
        urls,
        config.locales.list,
        folderData(name, collection, model.entries, folders, (entry) => urls.url(entry.descriptor)),
        messageKeys,
      ),
    );

    for (const entry of model.entries) files.push(...entryFile(project, model, entry));
  }

  // Term pages: from the kept entries and their resolved terms.
  const terms = termPagesOf({
    locales: config.locales,
    collections: config.collections,
    taxonomies: config.taxonomies ?? {},
    urls,
    entries: assembly.entries,
  });
  const url = (entry: (typeof assembly.entries)[number]): string => urls.url(entry.descriptor);
  const termPages = termData(config, assembly.entries, terms, url);

  files.push(...termsFile(project, config, models, termPages));
  files.push(
    ...urlsFile(project, config, models, folders, terms, pageSeo(config, assembly.entries, folders, termPages, url)),
  );
  files.push(...navigationFile(project, config, assembly.entries, folders));
  files.push(...taxonomiesFile(project, config));

  if (config.messages !== undefined && input.messages !== undefined) {
    files.push(
      ...messageTypesFile(project, config, input.messages),
      ...messageIndexFile(project, config, input.messages),
    );
  }

  yield* files.sort((a, b) => compareText(a.path, b.path));
}
