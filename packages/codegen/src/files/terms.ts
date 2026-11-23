/**
 * `terms/index`: term pages (`XTermPage`, `findXTermByUrl`, `xTermUrl`), their entries resolved from the light
 * indexes, and each term's own content when its taxonomy declares one (`content`: an entry of an unmounted
 * collection, keyed by term, in the page's locale). A module of its own: `#figatellultimate/taxonomies` stays pure data for
 * the client.
 *
 * Key design decision: a term's data is written once, on its first page; its further pages (`…/page/N`, by its
 * taxonomy's `perPage`) are listed with their own URLs and translations, and found as the term with their number,
 * every entry listed, the app slicing them: as a folder's. A page's translations are the same page elsewhere.
 */
import type { Entry, FigatellultimateConfig, TermPage } from '@figatellultimate/core';
import { VariableDeclarationKind, type Project } from 'ts-morph';

import { compareText, literal, pascal, type CollectionModel } from '../model.js';
import { render, type GeneratedFile } from '../render.js';
import { property, union } from './type-builders.js';

/** One term's data, on its first page: its entries by collection and URL, newest first, and its further pages. */
export interface TermData {
  readonly url: string;
  readonly locale: string;
  readonly taxonomy: string;
  readonly term: string;
  readonly alternates: Readonly<Record<string, string>>;
  readonly entries: readonly { readonly collection: string; readonly url: string }[];
  /** How many pages the term has (1 without a page size). */
  readonly pages: number;
  /** Its taxonomy's page size, when it has one. */
  readonly perPage?: number;
  /** Its index URL (`pages.index`), shared by its every page; none otherwise. */
  readonly index?: string;
  /** Its SEO (`pages.metadata`): the message key of its description. */
  readonly metadata: { readonly description?: string };
  /** Its pages after the first: each one's URL, number and translations (a locale may have fewer pages). */
  readonly slices: readonly {
    readonly url: string;
    readonly page: number;
    readonly alternates: Readonly<Record<string, string>>;
  }[];
}

/**
 * Every term page's data: in its locale, the kept, non-reserved entries referencing its term from any
 * collection, newest first by each collection's date field, then by collection and key. Pure, deterministic.
 *
 * @param config - The config: references and date fields.
 * @param entries - The kept entries.
 * @param pages - The term pages (core's `termPagesOf`).
 * @param url - An entry's URL, by the project's strategy.
 * @returns Each term's first page with its translations, its entries in order and its further pages.
 */
export function termData(
  config: FigatellultimateConfig,
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

  // A page's translations: the same page (route) of the same term elsewhere.
  const alternatesOf = (page: TermPage): Readonly<Record<string, string>> =>
    Object.fromEntries(
      pages
        .filter((other) => other.taxonomy === page.taxonomy && other.route === page.route)
        .map((other) => [other.locale, other.url]),
    );

  return pages.flatMap((page): TermData[] => {
    if (page.page > 1) return [];

    const perPage = config.taxonomies?.[page.taxonomy]?.pages?.perPage;
    const description = config.taxonomies?.[page.taxonomy]?.pages?.metadata?.description;

    return [
      {
        url: page.url,
        locale: page.locale,
        taxonomy: page.taxonomy,
        term: page.term,
        alternates: alternatesOf(page),
        pages: page.pages,
        ...(perPage === undefined ? {} : { perPage }),
        ...(page.index === undefined ? {} : { index: page.index }),
        metadata:
          description === undefined
            ? {}
            : { description: ['taxonomies', page.taxonomy, page.term, description].join('.') },
        slices: pages
          .filter((slice) => slice.first === page.url && slice.page > 1)
          .map((slice) => ({ url: slice.url, page: slice.page, alternates: alternatesOf(slice) })),
        entries: entries
          .filter(
            (entry) =>
              entry.descriptor.locale === page.locale &&
              !entry.descriptor.reserved &&
              references(entry, page.taxonomy, page.term),
          )
          .sort(newestFirst)
          .map((entry) => ({ collection: entry.descriptor.collection, url: url(entry) })),
      },
    ];
  });
}

/**
 * The taxonomies with pages, and the collections referencing each.
 *
 * @param config - The config.
 * @returns Each taxonomy with pages, and the collections whose reference fields point to it.
 */
export function termTaxonomies(
  config: FigatellultimateConfig,
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
 * the light indexes (nothing duplicated). A module of its own: `#figatellultimate/taxonomies` stays pure data for the client.
 *
 * @param project - The in-memory ts-morph project.
 * @param config - The config.
 * @param models - The collections' models.
 * @param data - Every term page's data (`termData`).
 * @param messageKeys - Whether the term pages' description keys are typed by the generated `MessageKey`.
 * @returns The generated file(s), built in memory; nothing is written. None without a taxonomy with pages.
 */
export function termsFile(
  project: Project,
  config: FigatellultimateConfig,
  models: readonly CollectionModel[],
  data: readonly TermData[],
  messageKeys = false,
): GeneratedFile[] {
  const taxonomies = termTaxonomies(config);
  // A term page's description key, typed by the generated `MessageKey` when the project declares messages.
  const key = messageKeys ? 'MessageKey' : 'string';

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

    if (messageKeys)
      file.addImportDeclaration({
        isTypeOnly: true,
        moduleSpecifier: '../messages/index.js',
        namedImports: ['MessageKey'],
      });

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
          property('page', 'number'),
          property('pages', 'number'),
          property('first', 'string'),
          property('perPage', 'number', true),
          {
            ...property('index', 'string', true),
            docs: ['Its index URL (`pages.index`), shared by its every page: every entry a filter or a sort needs.'],
          },
          {
            ...property('metadata', `{ readonly description?: ${key} }`),
            docs: ['Its SEO (`pages.metadata`): the message key of its description.'],
          },
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
      const raw = `{ readonly url: string; readonly locale: Locale; readonly taxonomy: ${literal(name)}; readonly term: ${prefix}Term; readonly alternates: Readonly<Partial<Record<Locale, string>>>; readonly entries: readonly { readonly collection: ${mine.map((model) => literal(model.name)).join(' | ') || 'never'}; readonly url: string }[]; readonly pages: number; readonly perPage?: number; readonly index?: string; readonly metadata: { readonly description?: ${key} } }`;
      const mineData = data.filter((page) => page.taxonomy === name);

      file.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
          {
            name: `${name}TermData`,
            type: `ReadonlyMap<string, ${raw}>`,
            // Each term's data once, its further pages in the slices.
            initializer: `new Map(${literal(
              mineData.map((page) => [
                page.url,
                Object.fromEntries(Object.entries(page).filter(([field]) => field !== 'slices')),
              ]),
            )})`,
          },
        ],
      });
      file.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
          {
            name: `${name}TermSlices`,
            type: 'ReadonlyMap<string, { readonly first: string; readonly page: number; readonly alternates: Readonly<Partial<Record<Locale, string>>> }>',
            initializer: `new Map(${literal(
              mineData.flatMap((page) =>
                page.slices.map((slice) => [
                  slice.url,
                  { first: page.url, page: slice.page, alternates: slice.alternates },
                ]),
              ),
            )})`,
          },
        ],
      });
      file.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
          {
            name: `${name}TermUrls`,
            type: 'ReadonlyMap<string, string>',
            initializer: `new Map(${literal(mineData.map((page) => [`${page.locale}\u0000${page.term}`, page.url]))})`,
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
        docs: [
          `The ${name} term page at a URL, as the build produced it, or \`undefined\`: a further page (\`…/page/N\`) is its term with its own URL, number and translations, every entry listed (the app shows its slice).`,
        ],
        parameters: [{ name: 'url', type: 'string' }],
        returnType: `${prefix}TermPage | undefined`,
        statements: (writer) => {
          writer.writeLine(`const slice = ${name}TermSlices.get(url);`);
          writer.writeLine(`const data = ${name}TermData.get(slice?.first ?? url);`);
          writer.writeLine('if (data === undefined) return undefined;');
          writer.writeLine(
            'const page = slice === undefined ? { url: data.url, page: 1, first: data.url, alternates: data.alternates } : { url, page: slice.page, first: slice.first, alternates: slice.alternates };',
          );
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

          if (content === undefined) writer.writeLine('return { ...data, ...page, entries };');
          else
            writer.writeLine(
              `return { ...data, ...page, entries, content: ${content.name}ByTerm.get(\`\${data.locale}\\u0000\${data.term}\`) };`,
            );
        },
      });

      if (config.taxonomies?.[name]?.pages?.index !== undefined)
        file.addFunction({
          name: `${name}ListingIndexes`,
          isExported: true,
          docs: [
            `The ${name} term pages with an index (\`pages.index\`): each term's first page, its every entry, in each locale; for the route serving the indexes (\`listingIndexRoute\`).`,
          ],
          returnType: `readonly ${prefix}TermPage[]`,
          statements: [
            `return [...${name}TermData.values()].flatMap((data) => (data.index === undefined ? [] : [find${prefix}TermByUrl(data.url) ?? []].flat()));`,
          ],
        });
    }
  });
}
