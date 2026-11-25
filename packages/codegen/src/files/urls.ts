/**
 * `urls/index`: one catch-all route for every collection: `findByUrl`, `mountedUrls` (entries, folder pages, term
 * pages; reserved entries out), `metadataFields`, and `urlOf` / `segmentsOf`, the project's URL strategy written
 * once so that an app never rewrites it, and `pageSegment`, the segment of a further page. Each URL tells whether it is searchable, indexed, and exposed to LLMs
 * (`llms`: an entry its collection's `llms` takes, its exclusion field not set, and indexed; never a folder or
 * term page).
 */
import { exposedToLlms, type FigatellultimateConfig, type FolderPage, type TermPage } from '@figatellultimate/core';
import { VariableDeclarationKind, Writers, type Project } from 'ts-morph';

import { literal, pascal, type CollectionModel } from '../model.js';
import { render, type GeneratedFile } from '../render.js';
import type { PageSeo } from '../seo.js';
import { termTaxonomies } from './terms.js';
import { property, union } from './type-builders.js';

/**
 * `urls/index.ts`: one catch-all route for every collection. `findByUrl` finds a mounted entry by its URL,
 * `mountedUrls` lists every mounted URL once (reserved entries and unmounted collections excluded),
 * `metadataFields` carries each collection's declared metadata fields so that an app never imports the config at
 * runtime.
 *
 * @param project - The in-memory ts-morph project.
 * @param config - The config: locales, URL strategy, collections.
 * @param models - The collections' models.
 * @param folders - The folder pages, mounted like entries.
 * @param terms - The term pages, mounted like entries.
 * @param seo - Each mounted page's date and indexing (`pageSeo`).
 * @returns The generated file(s), built in memory; nothing is written. It also holds `urlOf` and `segmentsOf`, the
 *   project's URL strategy written once.
 */
export function urlsFile(
  project: Project,
  config: FigatellultimateConfig,
  models: readonly CollectionModel[],
  folders: readonly FolderPage[] = [],
  terms: readonly TermPage[] = [],
  seo: ReadonlyMap<string, PageSeo> = new Map(),
): GeneratedFile[] {
  // An unmounted collection's entries have no URL: never found by URL, never mounted.
  const mounted = models.filter(({ name }) => config.collections[name]?.mounted !== false);
  const withFolders = new Set(folders.map((folder) => folder.collection));
  // Taxonomies with pages: their name stands for `collection` in a term page's mounted URL.
  const taxonomies = termTaxonomies(config).map(({ name }) => name);

  return render(project, 'urls/index.ts', 'module', (file) => {
    file.addImportDeclaration({ isTypeOnly: true, moduleSpecifier: '../locales/index.js', namedImports: ['Locale'] });

    for (const { name, type } of mounted) {
      const folderImports = withFolders.has(name)
        ? [`find${pascal(name)}FolderByUrl`, { name: `${pascal(name)}Folder`, isTypeOnly: true }]
        : [];

      file.addImportDeclaration({
        moduleSpecifier: `../${name}/index.js`,
        namedImports: [`${name}Index`, `find${type}ByUrl`, { name: type, isTypeOnly: true }, ...folderImports],
      });
    }

    if (taxonomies.length > 0)
      file.addImportDeclaration({
        moduleSpecifier: '../terms/index.js',
        namedImports: taxonomies.flatMap((name) => [
          `find${pascal(name)}TermByUrl`,
          { name: `${pascal(name)}TermPage`, isTypeOnly: true },
        ]),
      });

    const names = mounted.map(({ name }) => literal(name));

    file.addTypeAlias({ name: 'CollectionName', isExported: true, type: union(names) });
    const section = taxonomies.length === 0 ? 'CollectionName' : 'CollectionName | TermTaxonomyName';

    if (taxonomies.length > 0)
      file.addTypeAlias({
        name: 'TermTaxonomyName',
        isExported: true,
        docs: ['The taxonomies with a page per term.'],
        type: union(taxonomies.map(literal)),
      });

    file.addTypeAlias({
      name: 'UrlEntry',
      isExported: true,
      docs: [
        'A mounted page, discriminated by its kind (an entry, a folder page, or a term page), then its collection or taxonomy.',
      ],
      type: union([
        ...taxonomies.map((name) =>
          Writers.objectType({
            properties: [
              property('kind', "'term'"),
              property('taxonomy', literal(name)),
              property('term', `${pascal(name)}TermPage`),
            ],
          }),
        ),
        ...mounted.flatMap(({ name, type }) => [
          Writers.objectType({
            properties: [property('kind', "'entry'"), property('collection', literal(name)), property('entry', type)],
          }),
          ...(withFolders.has(name)
            ? [
                Writers.objectType({
                  properties: [
                    property('kind', "'folder'"),
                    property('collection', literal(name)),
                    property('folder', `${pascal(name)}Folder`),
                  ],
                }),
              ]
            : []),
        ]),
      ]),
    });
    file.addInterface({
      name: 'UrlItem',
      isExported: true,
      docs: [
        'A mounted URL, an entry, a folder page or a term page, with its translations (static params, sitemap). A term page’s `collection` is its taxonomy’s name, never a collection’s too.',
      ],
      properties: [
        property('kind', taxonomies.length === 0 ? "'entry' | 'folder'" : "'entry' | 'folder' | 'term'"),
        property('collection', section),
        property('url', 'string'),
        property('locale', 'Locale'),
        property('alternates', 'Readonly<Partial<Record<Locale, string>>>'),
        property('searchable', 'boolean'),
        {
          ...property('llms', 'boolean'),
          docs: ["Exposed to LLMs (`llms.txt`, its Markdown): its collection's `llms` takes it, and it is indexed."],
        },
        property('key', 'string'),
        property('modified', 'string', true),
        property('indexed', 'boolean'),
        {
          ...property('home', 'true', true),
          docs: [
            "The locale's home, its route `/`: where a locale switcher leads from a page with nowhere else to go.",
          ],
        },
      ],
    });
    file.addInterface({
      name: 'MetadataFields',
      isExported: true,
      docs: ['The frontmatter fields a collection declares for its site metadata.'],
      properties: [
        property('title', 'string', true),
        property('description', 'string', true),
        property('image', 'string', true),
        property('publishedTime', 'string', true),
        property('modifiedTime', 'string', true),
        property('tags', 'string', true),
        property('robots', 'string', true),
        property('canonical', 'string', true),
        {
          ...property('order', 'string', true),
          docs: [
            "The number placing an entry among its siblings: the navigation, a section's list, the previous and next links.",
          ],
        },
        property('type', "'website' | 'article'", true),
        property('schema', "'WebPage' | 'Article' | 'BlogPosting' | 'TechArticle' | 'NewsArticle'", true),
      ],
    });
    file.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      isExported: true,
      docs: ["Each collection's declared metadata fields."],
      declarations: [
        {
          name: 'metadataFields',
          type: 'Readonly<Record<CollectionName, MetadataFields>>',
          initializer: literal(
            Object.fromEntries(mounted.map(({ name }) => [name, config.collections[name]?.metadata ?? {}])),
          ),
        },
      ],
    });
    // Folder and term pages carry theirs in their literal items; the map holds the entries'.
    const pageUrls = new Set([...folders, ...terms].map((page) => page.url));
    const entrySeo = [...seo].filter(([url]) => !pageUrls.has(url));

    file.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      docs: ["Entries' dates and indexing: the ones that are dated or not indexed."],
      declarations: [
        {
          name: 'entrySeo',
          type: 'ReadonlyMap<string, { readonly modified?: string; readonly indexed: boolean }>',
          initializer: `new Map(${literal(entrySeo)})`,
        },
      ],
    });
    file.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: 'homes',
          type: 'ReadonlySet<string>',
          // The entries at the route `/` of their locale, by collection, locale and key: each locale's home, whatever
          // the collections' order (a folder's own page or a collection's root index has an empty key too).
          initializer: `new Set(${literal(
            mounted.flatMap(({ name, entries }) =>
              entries
                .filter((entry) => entry.descriptor.route === '/' && !entry.descriptor.reserved)
                .map((entry) => `${name}\u0000${entry.descriptor.locale}\u0000${entry.descriptor.key}`),
            ),
          )})`,
        },
      ],
    });
    file.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: 'llms',
          type: 'ReadonlySet<string>',
          // The entries exposed to LLMs, by collection, locale and key: matched by their collection's patterns, their
          // exclusion field not set.
          initializer: `new Set(${literal(
            mounted.flatMap(({ name, entries }) => {
              const collection = config.collections[name];

              return collection === undefined
                ? []
                : entries
                    .filter((entry) => exposedToLlms(collection, entry.descriptor.key, entry.data))
                    .map((entry) => `${name}\u0000${entry.descriptor.locale}\u0000${entry.descriptor.key}`);
            }),
          )})`,
        },
      ],
    });
    file.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      isExported: true,
      docs: ['Every mounted URL, once: reserved entries are left to their dedicated routes.'],
      declarations: [
        {
          name: 'mountedUrls',
          type: 'readonly UrlItem[]',
          initializer: `[${mounted
            .map(
              ({ name }) =>
                `...${name}Index.filter((item) => !item.reserved).map((item): UrlItem => { const seo = entrySeo.get(item.url) ?? { indexed: true }; return { kind: 'entry', collection: ${literal(name)}, url: item.url, locale: item.locale, alternates: item.alternates, searchable: ${String(config.collections[name]?.searchable ?? true)} && seo.indexed, llms: llms.has(\`${name}\\u0000\${item.locale}\\u0000\${item.key}\`) && seo.indexed, key: item.key, ...seo, ...(homes.has(\`${name}\\u0000\${item.locale}\\u0000\${item.key}\`) ? { home: true as const } : {}) }; })`,
            )
            .concat(folders.length === 0 ? [] : [`...(${literal(folderItems(folders, seo))} as readonly UrlItem[])`])
            .concat(terms.length === 0 ? [] : [`...(${literal(termItems(terms, seo))} as readonly UrlItem[])`])
            .join(', ')}]`,
        },
      ],
    });
    file.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: 'mounted',
          type: `ReadonlyMap<string, readonly [${section}, ${taxonomies.length === 0 ? "'entry' | 'folder'" : "'entry' | 'folder' | 'term'"}]>`,
          initializer: 'new Map(mountedUrls.map((item) => [item.url, [item.collection, item.kind] as const]))',
        },
      ],
    });
    // The project's URL strategy, written once here: the app never rewrites the prefix rule.
    const explicit = config.urls?.defaultLocale === 'explicit';
    const trailingSlash = config.urls?.trailingSlash === true;
    const prefixed = explicit ? 'true' : `locale !== ${literal(config.locales.default)}`;

    file.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      isExported: true,
      docs: [
        "The segment before a further page's number (`urls.page`, `page` by default): for the listings that read a page in the path back (`pageSegment` of `useNextUrl`).",
      ],
      declarations: [{ name: 'pageSegment', type: 'string', initializer: literal(config.urls?.page ?? 'page') }],
    });
    file.addFunction({
      name: 'urlOf',
      isExported: true,
      docs: [
        "The URL of a path in a locale, by the project's URL strategy: e.g. a catch-all route's segments to the URL `findByUrl` takes.",
      ],
      parameters: [
        { name: 'locale', type: 'Locale' },
        { name: 'segments', type: 'readonly string[]', initializer: '[]' },
      ],
      returnType: 'string',
      statements: [
        "const route = `/${segments.join('/')}`;",
        `const path = ${prefixed} ? \`/\${locale}\${route === '/' ? '' : route}\` : route;`,
        trailingSlash ? "return path.endsWith('/') ? path : `${path}/`;" : 'return path;',
      ],
    });
    file.addFunction({
      name: 'segmentsOf',
      isExported: true,
      docs: [
        "The path segments of a URL under its locale, by the project's URL strategy: `urlOf`'s inverse, e.g. a mounted URL to a catch-all route's params.",
      ],
      parameters: [
        { name: 'url', type: 'string' },
        { name: 'locale', type: 'Locale' },
      ],
      returnType: 'string[]',
      statements: [
        "const parts = url.split('/').filter((part) => part !== '');",
        `return ${prefixed} ? parts.slice(1) : parts;`,
      ],
    });
    file.addFunction({
      name: 'findByUrl',
      isExported: true,
      isAsync: true,
      docs: [
        'The mounted page at a URL (an entry, a folder page, or a term page), exactly as the build produced it, or `undefined`. URLs are unique across collections.',
      ],
      parameters: [{ name: 'url', type: 'string' }],
      returnType: 'Promise<UrlEntry | undefined>',
      statements: (writer) => {
        writer.writeLine('const page = mounted.get(url);');
        writer.writeLine('if (page === undefined) return undefined;');
        writer.writeLine('const [collection, kind] = page;');

        if (taxonomies.length > 0) {
          writer.writeLine("if (kind === 'term') {");

          for (const name of taxonomies) {
            writer.writeLine(`  if (collection === ${literal(name)}) {`);
            writer.writeLine(`    const term = find${pascal(name)}TermByUrl(url);`);
            writer.writeLine(
              `    return term === undefined ? undefined : { kind: 'term', taxonomy: ${literal(name)}, term };`,
            );
            writer.writeLine('  }');
          }

          writer.writeLine('  return undefined;');
          writer.writeLine('}');
        }

        writer.writeLine('switch (collection) {');

        for (const { name, type } of mounted) {
          writer.writeLine(`  case ${literal(name)}: {`);

          if (withFolders.has(name)) {
            writer.writeLine("    if (kind === 'folder') {");
            writer.writeLine(`      const folder = find${pascal(name)}FolderByUrl(url);`);
            writer.writeLine(
              `      return folder === undefined ? undefined : { kind: 'folder', collection: ${literal(name)}, folder };`,
            );
            writer.writeLine('    }');
          }

          writer.writeLine(`    const entry = await find${type}ByUrl(url);`);
          writer.writeLine(
            `    return entry === undefined ? undefined : { kind: 'entry', collection: ${literal(name)}, entry };`,
          );
          writer.writeLine('  }');
        }

        writer.writeLine('}');
      },
    });
  });
}

/** Folder pages as mounted URLs: their translations, and their key (the folder's values) for the switcher. */
function folderItems(folders: readonly FolderPage[], seo: ReadonlyMap<string, PageSeo>): unknown[] {
  return folders.map((folder) => ({
    kind: 'folder',
    collection: folder.collection,
    url: folder.url,
    locale: folder.locale,
    alternates: Object.fromEntries(
      folders
        .filter((other) => other.collection === folder.collection && other.route === folder.route)
        .map((other) => [other.locale, other.url]),
    ),
    searchable: false,
    llms: false,
    // The folder's values, and its page after the first: the switcher finds the same page in another locale.
    key: [...Object.values(folder.segments), ...(folder.page > 1 ? ['page', String(folder.page)] : [])].join('/'),
    ...(seo.get(folder.url) ?? { indexed: true }),
  }));
}

/** Term pages as mounted URLs, further pages included: their translations, their taxonomy's name, and the term as their key. */
function termItems(terms: readonly TermPage[], seo: ReadonlyMap<string, PageSeo>): unknown[] {
  return terms.map((page) => ({
    kind: 'term',
    collection: page.taxonomy,
    url: page.url,
    locale: page.locale,
    // The same page of the same term elsewhere: a further page's translations are that page.
    alternates: Object.fromEntries(
      terms
        .filter((other) => other.taxonomy === page.taxonomy && other.route === page.route)
        .map((other) => [other.locale, other.url]),
    ),
    searchable: false,
    llms: false,
    key: page.term,
    ...(seo.get(page.url) ?? { indexed: true }),
  }));
}
