/**
 * `terms/index`: term pages (`XTermPage`, `findXTermByUrl`, `xTermUrl`), their entries resolved from the light
 * indexes, and each term's own content when its taxonomy declares one (`content`: an entry of an unmounted
 * collection, keyed by term, in the page's locale). A module of its own: `#figatellu/taxonomies` stays pure data for
 * the client.
 */
import type { Entry, FigatelluConfig, TermPage } from '@figatellu/core';
import { VariableDeclarationKind, type Project } from 'ts-morph';

import { compareText, literal, pascal, type CollectionModel } from '../model.js';
import { render, type GeneratedFile } from '../render.js';
import { property, union } from './type-builders.js';

/** One term page's data: its entries by collection and URL, newest first, resolved from the light indexes. */
export interface TermData {
  readonly url: string;
  readonly locale: string;
  readonly taxonomy: string;
  readonly term: string;
  readonly alternates: Readonly<Record<string, string>>;
  readonly entries: readonly { readonly collection: string; readonly url: string }[];
}

/**
 * Every term page's data: in its locale, the kept, non-reserved entries referencing its term from any
 * collection, newest first by each collection's date field, then by collection and key. Pure, deterministic.
 *
 * @param config - The config: references and date fields.
 * @param entries - The kept entries.
 * @param pages - The term pages (core's `termPagesOf`).
 * @param url - An entry's URL, by the project's strategy.
 * @returns Each term page with its translations and its entries, in order.
 */
export function termData(
  config: FigatelluConfig,
  entries: readonly Entry[],
  pages: readonly TermPage[],
  url: (entry: Entry) => string,
): readonly TermData[] {
  const dateOf = (entry: Entry): string => {
    const field = config.collections[entry.descriptor.collection]?.metadata.publishedTime;
    const value = field === undefined ? undefined : entry.data[field];

    return typeof value === 'string' ? value : '';
  };
  const newestFirst = (a: Entry, b: Entry): number =>
    compareText(dateOf(b), dateOf(a)) ||
    compareText(a.descriptor.collection, b.descriptor.collection) ||
    compareText(a.descriptor.key, b.descriptor.key);
  const references = (entry: Entry, taxonomy: string, term: string): boolean =>
    Object.entries(config.collections[entry.descriptor.collection]?.references ?? {}).some(
      ([field, name]) => name === taxonomy && (entry.terms[field] ?? []).includes(term),
    );

  return pages.map((page) => ({
    url: page.url,
    locale: page.locale,
    taxonomy: page.taxonomy,
    term: page.term,
    alternates: Object.fromEntries(
      pages
        .filter((other) => other.taxonomy === page.taxonomy && other.term === page.term)
        .map((other) => [other.locale, other.url]),
    ),
    entries: entries
      .filter(
        (entry) =>
          entry.descriptor.locale === page.locale &&
          !entry.descriptor.reserved &&
          references(entry, page.taxonomy, page.term),
      )
      .sort(newestFirst)
      .map((entry) => ({ collection: entry.descriptor.collection, url: url(entry) })),
  }));
}

/**
 * The taxonomies with pages, and the collections referencing each.
 *
 * @param config - The config.
 * @returns Each taxonomy with pages, and the collections whose reference fields point to it.
 */
export function termTaxonomies(
  config: FigatelluConfig,
): readonly { readonly name: string; readonly collections: readonly string[] }[] {
  return Object.entries(config.taxonomies ?? {})
    .filter(([, taxonomy]) => taxonomy.pages !== null)
    .map(([name]) => ({
      name,
      collections: Object.entries(config.collections)
        .filter(([, collection]) => Object.values(collection.references).includes(name))
        .map(([collection]) => collection),
    }));
}

/**
 * `terms/index.ts`: for each taxonomy with pages, `XTermPage` and `findXTermByUrl`, the entries resolved from
 * the light indexes (nothing duplicated). A module of its own: `#figatellu/taxonomies` stays pure data for the client.
 *
 * @param project - The in-memory ts-morph project.
 * @param config - The config.
 * @param models - The collections' models.
 * @param data - Every term page's data (`termData`).
 * @returns The generated file(s), built in memory; nothing is written. None without a taxonomy with pages.
 */
export function termsFile(
  project: Project,
  config: FigatelluConfig,
  models: readonly CollectionModel[],
  data: readonly TermData[],
): GeneratedFile[] {
  const taxonomies = termTaxonomies(config);

  if (taxonomies.length === 0) return [];

  const referencing = models.filter(({ name }) => taxonomies.some((t) => t.collections.includes(name)));
  const contentOf = (taxonomy: string): CollectionModel | undefined => {
    const content = config.taxonomies?.[taxonomy]?.content;

    return content === null || content === undefined ? undefined : models.find((model) => model.name === content);
  };
  const contents = taxonomies.flatMap(({ name }) => {
    const model = contentOf(name);

    return model === undefined || referencing.includes(model) ? [] : [model];
  });

  return render(project, 'terms/index.ts', 'module', (file) => {
    file.addImportDeclaration({ isTypeOnly: true, moduleSpecifier: '../locales/index.js', namedImports: ['Locale'] });

    // Each term's content, by locale and term: the content collection's entries are keyed by term.
    for (const { name, type } of contents) {
      file.addImportDeclaration({
        moduleSpecifier: `../${name}/index.js`,
        namedImports: [`${name}Index`, { name: `${type}IndexItem`, isTypeOnly: true }],
      });
      file.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
          {
            name: `${name}ByTerm`,
            type: `ReadonlyMap<string, ${type}IndexItem>`,
            initializer: `new Map(${name}Index.map((item) => [\`\${item.locale}\\u0000\${item.key}\`, item]))`,
          },
        ],
      });
    }

    for (const { name, type } of referencing) {
      file.addImportDeclaration({
        moduleSpecifier: `../${name}/index.js`,
        namedImports: [`${name}Index`, { name: `${type}IndexItem`, isTypeOnly: true }],
      });
      file.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
          {
            name: `${name}ByUrl`,
            type: `ReadonlyMap<string, ${type}IndexItem>`,
            initializer: `new Map(${name}Index.map((item) => [item.url, item]))`,
          },
        ],
      });
    }

    for (const { name, collections } of taxonomies) {
      const prefix = pascal(name);
      const content = contentOf(name);
      const terms = config.taxonomies?.[name]?.terms ?? [];
      const mine = referencing.filter((model) => collections.includes(model.name));

      file.addTypeAlias({ name: `${prefix}Term`, isExported: true, type: union(terms.map(literal)) });
      file.addTypeAlias({
        name: `${prefix}TermEntry`,
        isExported: true,
        docs: [`An entry referencing a ${name} term, discriminated by its collection.`],
        type: union(
          mine.map(
            ({ name: collection, type }) =>
              `{ readonly collection: ${literal(collection)}; readonly item: ${type}IndexItem }`,
          ),
        ),
      });
      file.addInterface({
        name: `${prefix}TermPage`,
        isExported: true,
        docs: [`A ${name} term's page: neutral data, rendered by the app; its entries newest first.`],
        properties: [
          property('url', 'string'),
          property('locale', 'Locale'),
          property('taxonomy', literal(name)),
          property('term', `${prefix}Term`),
          property('alternates', 'Readonly<Partial<Record<Locale, string>>>'),
          property('entries', `readonly ${prefix}TermEntry[]`),
          ...(content === undefined
            ? []
            : [
                {
                  ...property('content', `${content.type}IndexItem | undefined`),
                  docs: [
                    `The term's own content in this locale (\`${content.name}\`), \`undefined\` where it has none.`,
                  ],
                },
              ]),
        ],
      });
      const raw = `{ readonly url: string; readonly locale: Locale; readonly taxonomy: ${literal(name)}; readonly term: ${prefix}Term; readonly alternates: Readonly<Partial<Record<Locale, string>>>; readonly entries: readonly { readonly collection: ${mine.map((model) => literal(model.name)).join(' | ') || 'never'}; readonly url: string }[] }`;

      file.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
          {
            name: `${name}TermData`,
            type: `ReadonlyMap<string, ${raw}>`,
            initializer: `new Map(${literal(data.filter((page) => page.taxonomy === name).map((page) => [page.url, page]))})`,
          },
        ],
      });
      file.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
          {
            name: `${name}TermUrls`,
            type: 'ReadonlyMap<string, string>',
            initializer: `new Map(${literal(
              data
                .filter((page) => page.taxonomy === name)
                .map((page) => [`${page.locale}\u0000${page.term}`, page.url]),
            )})`,
          },
        ],
      });
      file.addFunction({
        name: `${name}TermUrl`,
        isExported: true,
        docs: [
          `A ${name} term's page URL in a locale, \`undefined\` where the term has no page there: e.g. to link it.`,
        ],
        parameters: [
          { name: 'term', type: `${prefix}Term` },
          { name: 'locale', type: 'Locale' },
        ],
        returnType: 'string | undefined',
        statements: [`return ${name}TermUrls.get(\`\${locale}\\u0000\${term}\`);`],
      });
      file.addFunction({
        name: `find${prefix}TermByUrl`,
        isExported: true,
        docs: [`The ${name} term page at a URL, as the build produced it, or \`undefined\`.`],
        parameters: [{ name: 'url', type: 'string' }],
        returnType: `${prefix}TermPage | undefined`,
        statements: (writer) => {
          writer.writeLine(`const data = ${name}TermData.get(url);`);
          writer.writeLine('if (data === undefined) return undefined;');
          writer.writeLine(`// Entry URLs come from this build's indexes: each one is found.`);
          writer.writeLine(`const entries = data.entries.flatMap((entry): ${prefix}TermEntry[] => {`);
          writer.writeLine('  switch (entry.collection) {');

          for (const { name: collection } of mine) {
            writer.writeLine(`    case ${literal(collection)}: {`);
            writer.writeLine(`      const item = ${collection}ByUrl.get(entry.url);`);
            writer.writeLine(`      return item === undefined ? [] : [{ collection: ${literal(collection)}, item }];`);
            writer.writeLine('    }');
          }

          writer.writeLine('  }');

          if (mine.length === 0) writer.writeLine('  return [];');

          writer.writeLine('});');

          if (content === undefined) writer.writeLine('return { ...data, entries };');
          else
            writer.writeLine(
              `return { ...data, entries, content: ${content.name}ByTerm.get(\`\${data.locale}\\u0000\${data.term}\`) };`,
            );
        },
      });
    }
  });
}
