/**
 * `<collection>/index`: the light index, the getters (`getX`, `findX`, `findXByUrl`, `listX`, `isXQuery`), the
 * facet indexes keyed by entry URL, and the folder pages.
 */
import type { Entry, UrlBuilder } from '@figatellultimate/core';
import { VariableDeclarationKind, Writers, type CodeBlockWriter, type Project, type SourceFile } from 'ts-morph';

import { entryModule, literal, parameterValues, pascal, type CollectionModel } from '../model.js';
import type { FolderData } from '../folders.js';
import { render, type GeneratedFile } from '../render.js';
import { indexedAccess, keysAtDepth, property, union } from './type-builders.js';

const RECORD = 'Readonly<Record<string, unknown>>';

/** One light index item, as an object literal; its data module is imported lazily. */
function indexItem(
  model: CollectionModel,
  entry: Entry,
  urls: UrlBuilder,
  alternates: Readonly<Record<string, Readonly<Record<string, string>>>>,
): (writer: CodeBlockWriter) => void {
  const { descriptor } = entry;

  return Writers.object({
    key: literal(descriptor.key),
    locale: literal(descriptor.locale),
    route: literal(descriptor.route),
    url: literal(urls.url(descriptor)),
    alternates: literal(alternates[descriptor.key] ?? {}),
    segments: literal(descriptor.segments),
    slug: literal(descriptor.slug),
    terms: literal(entry.terms),
    draft: literal(entry.draft),
    reserved: literal(descriptor.reserved),
    query: literal(parameterValues(model.collection, entry)),
    load: `() => import(${literal(`./${entryModule(entry)}.js`)})`,
  });
}

function addImports(file: SourceFile, type: string): void {
  const types = [type, `${type}IndexItem`, `${type}Tree`, `Validated${type}Query`];

  file.addImportDeclaration({ isTypeOnly: true, moduleSpecifier: '../locales/index.js', namedImports: ['Locale'] });
  file.addImportDeclaration({ isTypeOnly: true, moduleSpecifier: './types.js', namedImports: types });
  file.addExportDeclaration({
    isTypeOnly: true,
    moduleSpecifier: './types.js',
    namedExports: [type, `${type}Data`, `${type}IndexItem`, `${type}Tree`, `Validated${type}Query`],
  });
}

/** The index array and the single, untyped lookup behind `getX` and `findX` (no narrowing paid twice, §9). */
/** Every entry's translations, URL by locale, in the declared locale order: built once. */
function alternatesOf(
  model: CollectionModel,
  urls: UrlBuilder,
  locales: readonly string[],
): Record<string, Record<string, string>> {
  const byKey = new Map<string, Map<string, string>>();

  for (const { descriptor } of model.entries) {
    const translations = byKey.get(descriptor.key) ?? new Map<string, string>();

    translations.set(descriptor.locale, urls.url(descriptor));
    byKey.set(descriptor.key, translations);
  }

  return Object.fromEntries(
    [...byKey].map(([key, translations]) => [
      key,
      Object.fromEntries(
        locales.flatMap((locale) => {
          const url = translations.get(locale);

          return url === undefined ? [] : [[locale, url]];
        }),
      ),
    ]),
  );
}

function addLookup(file: SourceFile, model: CollectionModel, urls: UrlBuilder, locales: readonly string[]): void {
  const { name, type, parameters, entries } = model;
  const alternates = alternatesOf(model, urls, locales);
  const constant = (
    declaration: { name: string; type?: string; initializer: string | ((w: CodeBlockWriter) => void) },
    docs?: string,
  ) =>
    file.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      ...(docs === undefined ? {} : { docs: [docs] }),
      declarations: [declaration],
    });

  file.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    docs: [`Every ${type} of the build, light (no data, no body).`],
    declarations: [
      {
        name: `${name}Index`,
        type: `readonly ${type}IndexItem[]`,
        initializer: (writer) => {
          writer.write('[').newLine();
          writer.indent(() => {
            for (const entry of entries) {
              indexItem(model, entry, urls, alternates)(writer);
              writer.write(',').newLine();
            }
          });
          writer.write(']');
        },
      },
    ],
  });
  constant({ name: 'PARAMETERS', initializer: `${literal(parameters)} as const` });
  constant(
    {
      name: 'lookupKey',
      initializer: `(query: ${RECORD}): string => PARAMETERS.map((parameter) => String(query[parameter])).join('\\u0000')`,
    },
    'The single, untyped lookup behind getX and findX: no narrowing paid twice.',
  );
  constant({
    name: 'byQuery',
    type: `ReadonlyMap<string, ${type}IndexItem>`,
    initializer: `new Map(${name}Index.map((item) => [lookupKey(item.query), item]))`,
  });
  constant(
    {
      name: 'byUrl',
      type: `ReadonlyMap<string, ${type}IndexItem>`,
      initializer: `new Map(${name}Index.map((item) => [item.url, item]))`,
    },
    'The URLs the build produced, by the single URL rule: looked up, never parsed.',
  );
  constant(
    {
      name: 'entryOf',
      initializer: `async (item: ${type}IndexItem): Promise<${type}> => {\n  const { load, ...rest } = item;\n  const { data, body } = await load();\n  return { ...rest, data, body };\n}`,
    },
    'Loads an entry from its light index item.',
  );
}

/** `isX`, `getX` (generic overload narrowed level by level, plus the validated overload), `findX`. */
function addGetters(file: SourceFile, model: CollectionModel): void {
  const { type, levels } = model;
  const tree = `${type}Tree`;
  const validated = `Validated${type}Query`;

  file.addFunction({
    name: `is${type}Query`,
    isExported: true,
    docs: [`Whether a value designates an existing ${type}: the guard at the URL boundary.`],
    parameters: [{ name: 'value', type: 'unknown' }],
    returnType: `value is ${validated}`,
    statements: [
      "if (typeof value !== 'object' || value === null) return false;",
      `const record = value as ${RECORD};`,
      "return PARAMETERS.every((parameter) => typeof record[parameter] === 'string') && byQuery.has(lookupKey(record));",
    ],
  });

  file.addFunction({
    name: `get${type}`,
    isExported: true,
    isAsync: true,
    overloads: [
      {
        docs: [`An existing ${type}, typed by the content: each parameter is narrowed by the previous ones.`],
        typeParameters: [
          ...levels.map((_, depth) => ({
            name: `T${String(depth)}`,
            constraint: `keyof ${indexedAccess(tree, depth)}`,
          })),
          { name: 'L', constraint: `${indexedAccess(tree, levels.length)} & Locale` },
        ],
        parameters: [
          {
            name: 'query',
            type: Writers.objectType({
              properties: [
                property('locale', 'L'),
                ...levels.map((level, depth) => property(level, `T${String(depth)}`)),
              ],
            }),
          },
        ],
        returnType: `Promise<${type}>`,
      },
      {
        docs: [`A ${type} whose query was checked by \`is${type}Query\`.`],
        parameters: [{ name: 'query', type: validated }],
        returnType: `Promise<${type}>`,
      },
    ],
    parameters: [{ name: 'query', type: RECORD }],
    returnType: `Promise<${type}>`,
    statements: [
      'const item = byQuery.get(lookupKey(query));',
      `if (item === undefined) throw new Error(\`No ${type} for \${JSON.stringify(query)}: the generated code is out of date (run figatellultimate build).\`);`,
      'return entryOf(item);',
    ],
  });

  file.addFunction({
    name: `find${type}`,
    isExported: true,
    isAsync: true,
    docs: [`A ${type} from untrusted strings (URL params): \`undefined\` when it does not exist.`],
    parameters: [{ name: 'query', type: '{ readonly [K in (typeof PARAMETERS)[number]]: string }' }],
    returnType: `Promise<${type} | undefined>`,
    statements: [`return is${type}Query(query) ? get${type}(query) : undefined;`],
  });

  file.addFunction({
    name: `find${type}ByUrl`,
    isExported: true,
    isAsync: true,
    docs: [`The ${type} at a URL, exactly as the build produced it (\`/en/docs/setup\`): \`undefined\` otherwise.`],
    parameters: [{ name: 'url', type: 'string' }],
    returnType: `Promise<${type} | undefined>`,
    statements: ['const item = byUrl.get(url);', 'return item === undefined ? undefined : entryOf(item);'],
  });
}

/**
 * `xFacets`: for each taxonomy reference, term → URLs of the entries carrying it, sorted; built once
 * from the resolved terms. Nothing for a collection without references (no phony export).
 */
function addFacets(file: SourceFile, model: CollectionModel, urls: UrlBuilder): void {
  const fields = Object.keys(model.collection.references);

  if (fields.length === 0) return;

  const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  const facets = Object.fromEntries(
    [...fields].sort(compare).map((field) => {
      const byTerm = new Map<string, string[]>();

      for (const entry of model.entries) {
        for (const term of entry.terms[field] ?? [])
          byTerm.set(term, [...(byTerm.get(term) ?? []), urls.url(entry.descriptor)]);
      }

      return [
        field,
        Object.fromEntries(
          [...byTerm.keys()].sort(compare).map((term) => [term, [...(byTerm.get(term) ?? [])].sort(compare)]),
        ),
      ];
    }),
  );

  file.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    docs: ['Facet indexes: for each taxonomy reference, term → URLs of the entries carrying it.'],
    declarations: [
      {
        name: `${model.name}Facets`,
        type: Writers.objectType({
          properties: Object.keys(facets).map((field) =>
            property(literal(field), 'Readonly<Record<string, readonly string[]>>'),
          ),
        }),
        initializer: literal(facets),
      },
    ],
  });
}

/** `listX`: light items of a locale, optionally filtered by leading levels (all but the last). */
function addList(file: SourceFile, model: CollectionModel): void {
  const { name, type, levels } = model;

  file.addFunction({
    name: `list${pascal(name)}`,
    isExported: true,
    docs: ['Light index items of a locale, optionally filtered by leading segments.'],
    parameters: [
      {
        name: 'filter',
        type: Writers.objectType({
          properties: [
            property('locale', 'Locale'),
            ...levels.slice(0, -1).map((level, depth) => property(level, keysAtDepth(`${type}Tree`, depth), true)),
          ],
        }),
      },
    ],
    returnType: `readonly ${type}IndexItem[]`,
    statements: [
      `const record = filter as ${RECORD};`,
      `return ${name}Index.filter((item) => PARAMETERS.every((parameter) => record[parameter] === undefined || item.query[parameter] === record[parameter]));`,
    ],
  });
}

/**
 * `<collection>/index.ts`: the light index and the generated getters.
 *
 * @param project - The in-memory ts-morph project.
 * @param model - The collection.
 * @param urls - The project's URL strategy.
 * @param locales - The declared locales.
 * @param folders - The collection's folder pages' data.
 * @param messageKeys - Whether label keys are typed by the generated `MessageKey`.
 * @returns The generated file(s), built in memory; nothing is written.
 */
export function indexFile(
  project: Project,
  model: CollectionModel,
  urls: UrlBuilder,
  locales: readonly string[],
  folders: readonly FolderData[] = [],
  messageKeys = false,
): GeneratedFile[] {
  return render(project, `${model.name}/index.ts`, 'module', (file) => {
    addImports(file, model.type);
    addLookup(file, model, urls, locales);
    addGetters(file, model);
    addList(file, model);
    addFacets(file, model, urls);

    if (model.collection.folderPages !== null) addFolders(file, model, folders, messageKeys);
  });
}

/**
 * `XFolder` and `findXFolderByUrl`: each folder page's data, its entries by URL resolved from the
 * light index (nothing duplicated), its labels typed as message keys when the project declares messages.
 */
function addFolders(
  file: SourceFile,
  model: CollectionModel,
  folders: readonly FolderData[],
  messageKeys: boolean,
): void {
  const { type, collection, name } = model;
  // Named after the collection, like `listX`: a folder belongs to the collection, not to an entry.
  const folderType = pascal(name);
  const levels = collection.folderPages?.levels ?? [];
  const named = collection.grammar.flatMap((part) => (part.kind === 'segment' ? [part.name] : []));
  const key = messageKeys ? 'MessageKey' : 'string';
  // The fields any level declares: a folder carries the message keys of its own level's.
  const declaredFields = [
    ...new Set(Object.values(collection.messages).flatMap((fields: readonly string[] | undefined) => fields ?? [])),
  ].sort();
  const messagesType = `Readonly<Partial<Record<${declaredFields.map(literal).join(' | ') || 'never'}, ${key}>>>`;

  if (messageKeys)
    file.addImportDeclaration({
      isTypeOnly: true,
      moduleSpecifier: '../messages/index.js',
      namedImports: ['MessageKey'],
    });

  const item = `${type}IndexItem`;

  file.addInterface({
    name: `${folderType}Subfolder`,
    isExported: true,
    docs: ['A subfolder of a folder page: its own page when its level has one, its latest entries by date.'],
    properties: [
      property('segments', 'Readonly<Record<string, string>>'),
      property('level', union(named.map(literal))),
      property('label', key),
      property('messages', messagesType),
      property('url', 'string', true),
      property('image', 'string', true),
      property('total', 'number'),
      property('latest', `readonly ${item}[]`),
    ],
  });
  file.addInterface({
    name: `${folderType}Folder`,
    isExported: true,
    docs: ['A folder page: neutral data, rendered by the app.'],
    properties: [
      property('url', 'string'),
      property('locale', 'Locale'),
      property('segments', 'Readonly<Record<string, string>>'),
      property('level', [...levels.map(literal), 'null'].join(' | ')),
      property('label', `${key} | null`),
      property('messages', messagesType),
      {
        ...property('metadata', `{ readonly description?: ${key} }`),
        docs: ['Its SEO (`folderPages.metadata`): the message key of its description.'],
      },
      property('image', 'string', true),
      property('alternates', 'Readonly<Partial<Record<Locale, string>>>'),
      property('subfolders', `readonly ${folderType}Subfolder[]`),
      property('entries', `readonly ${item}[]`),
      property('page', 'number'),
      property('pages', 'number'),
      property('first', 'string'),
      property('perPage', 'number', true),
      {
        ...property('index', 'string', true),
        docs: [
          "Its listing's index URL (`folderPages.index`), shared by its every page: every entry a filter or a sort needs.",
        ],
      },
    ],
  });
  file.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: 'folderData',
        type: 'ReadonlyMap<string, FolderData>',
        // Each folder's data once, its slices in folderSlices.
        initializer: `new Map(${literal(
          folders.map((folder) => [
            folder.url,
            Object.fromEntries(Object.entries(folder).filter(([field]) => field !== 'slices')),
          ]),
        )})`,
      },
    ],
  });
  file.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: 'folderSlices',
        type: 'ReadonlyMap<string, { readonly first: string; readonly page: number; readonly alternates: Readonly<Partial<Record<Locale, string>>> }>',
        initializer: `new Map(${literal(
          folders.flatMap((folder) =>
            folder.slices.map((slice) => [
              slice.url,
              { first: folder.url, page: slice.page, alternates: slice.alternates },
            ]),
          ),
        )})`,
      },
    ],
  });
  file.addTypeAlias({
    name: 'FolderData',
    type: `{ readonly url: string; readonly locale: Locale; readonly segments: Readonly<Record<string, string>>; readonly level: ${[...levels.map(literal), 'null'].join(' | ')}; readonly label: ${key} | null; readonly messages: ${messagesType}; readonly metadata: { readonly description?: ${key} }; readonly image?: string; readonly alternates: Readonly<Partial<Record<Locale, string>>>; readonly subfolders: readonly { readonly segments: Readonly<Record<string, string>>; readonly level: string; readonly label: ${key}; readonly messages: ${messagesType}; readonly url?: string; readonly image?: string; readonly total: number; readonly latest: readonly string[] }[]; readonly entries: readonly string[]; readonly pages: number; readonly perPage?: number; readonly index?: string }`,
  });
  file.addFunction({
    name: `find${folderType}FolderByUrl`,
    isExported: true,
    docs: [
      `The ${name} folder page at a URL, as the build produced it, or \`undefined\`: a further page (\`…/page/N\`) is its folder with its own URL, number and translations, every item listed (the app shows its slice).`,
    ],
    parameters: [{ name: 'url', type: 'string' }],
    returnType: `${folderType}Folder | undefined`,
    statements: [
      'const slice = folderSlices.get(url);',
      'const data = folderData.get(slice?.first ?? url);',
      'if (data === undefined) return undefined;',
      `// Entry URLs come from this build's index: each one is in \`byUrl\`.`,
      `const items = (urls: readonly string[]): readonly ${item}[] => urls.flatMap((entry) => byUrl.get(entry) ?? []);`,
      'const page = slice === undefined ? { url: data.url, page: 1, first: data.url, alternates: data.alternates } : { url, page: slice.page, first: slice.first, alternates: slice.alternates };',
      'return { ...data, ...page, subfolders: data.subfolders.map((subfolder) => ({ ...subfolder, latest: items(subfolder.latest) })), entries: items(data.entries) };',
    ],
  });

  if (collection.folderPages?.index !== undefined)
    file.addFunction({
      name: `${name}ListingIndexes`,
      isExported: true,
      docs: [
        `The ${name} listings with an index (\`folderPages.index\`): each one's first page, its every entry, in each locale; for the route serving the indexes (\`listingIndexRoute\`).`,
      ],
      returnType: `readonly ${folderType}Folder[]`,
      statements: [
        `return [...folderData.values()].flatMap((data) => (data.index === undefined ? [] : [find${folderType}FolderByUrl(data.url) ?? []].flat()));`,
      ],
    });
}
