import {
  analyze,
  assemble,
  contentMessageTree,
  defineCollection,
  defineConfig,
  defineLocales,
  defineTaxonomy,
  locale,
  segment,
  slug,
  type ContentSource,
  type FigatellultimateConfig,
} from '@figatellultimate/core';
import { analyzeMessages } from '@figatellultimate/messages';
import { Project, ts } from 'ts-morph';
import { describe, expect, it } from 'vitest';

import { emit, type GeneratedFile } from '../index.js';

const OUTPUT = '/project/.figatellultimate';

const source: ContentSource = {
  directories: () => Promise.resolve({ blog: 'content/blog' }),
  async *documents() {
    yield* [];
    await Promise.resolve();
  },
};

const config: FigatellultimateConfig = defineConfig({
  locales: defineLocales({ list: { fr: { label: 'Français' }, en: { label: 'English' } }, default: 'fr' }),
  collections: {
    blog: defineCollection({
      entry: 'blogPost',
      base: 'blog',
      grammar: [segment('category'), segment('subcategory'), locale({ optional: true }), slug()],
      messages: { category: ['title'], subcategory: ['title'] },
    }),
  },
  taxonomies: { tags: defineTaxonomy(['bot'], { messages: ['label'] }) },
  messages: { directory: 'messages' },
  source,
  splitRoutes: false,
});

const SOURCES = ['patch-notes/bot/post.mdx'].map((sourcePath) => ({ collection: 'blog', sourcePath }));

type Module = Record<string, unknown>;

const FR: Module = {
  content: { blog: { 'patch-notes': { $: { title: 'Notes' }, bot: { $: { title: 'Bot' } } } } },
  taxonomies: { tags: { bot: { label: 'Bot' } } },
  home: {
    posts: '{count, plural, one {# billet} many {# billets} other {# billets}}',
    greeting: '{gender, select, female {Bienvenue} other {Bienvenu}} {name}, le {day, date}',
    // Argument names ICU accepts, TypeScript not as a bare property name: a digit first, an emoji, a number.
    badge: '{1st} {🎉} {0}',
    title: 'Accueil',
  },
};
const EN: Module = {
  content: { blog: { 'patch-notes': { $: { title: 'Patch notes' }, bot: { $: { title: 'Bot' } } } } },
  taxonomies: { tags: { bot: { label: 'Bot' } } },
  home: {
    posts: '{count, plural, one {# post} other {# posts}}',
    greeting: '{gender, select, female {Welcome} other {Welcome}} {name}, on {day, date}',
    badge: '{1st} {🎉} {0}',
    title: 'Home',
  },
};

/** A message module as the user writes it: JSON is a valid object literal. */
const moduleSource = (messages: Module, type: 'ReferenceMessages' | 'Messages'): string =>
  `import type { ${type} } from '../.figatellultimate/messages/index.js';\n\nexport default ${JSON.stringify(messages)} as const satisfies ${type};\n`;

/** A deep copy of a module, changed by `edit`. */
function variant(messages: Module, edit: (copy: Module) => void): Module {
  const copy = structuredClone(messages);

  edit(copy);

  return copy;
}
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** A nested group of a module, checked rather than cast: the tests edit it in place. */
function group(parent: unknown, ...path: readonly string[]): Record<string, unknown> {
  let node = parent;

  for (const key of path) node = isRecord(node) ? node[key] : undefined;

  if (!isRecord(node)) throw new Error(`No group at ${path.join('.')}`);

  return node;
}
const home = (messages: Module): Record<string, unknown> => group(messages, 'home');
const patchNotes = (messages: Module): Record<string, unknown> => group(messages, 'content', 'blog', 'patch-notes');

/** The generated modules, from the real analysis of the modules above (evaluated as plain objects). */
function generate(): GeneratedFile[] {
  const analysis = analyze({ locales: config.locales, collections: config.collections, sources: SOURCES });
  const tree = contentMessageTree({
    collections: config.collections,
    taxonomies: config.taxonomies ?? {},
    entries: analysis.entries,
  });
  const messages = analyzeMessages({ locales: config.locales, tree, modules: { 'fr.ts': FR, 'en.ts': EN } });

  // Precondition: the fixtures are valid, so the generated types describe them.
  expect(messages.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const assembly = assemble({
    analysis,
    documents: SOURCES.map((s) => ({ ...s, data: {}, body: '' })),
    sourceDiagnostics: [],
    collections: config.collections,
    taxonomies: config.taxonomies ?? {},
    environment: { drafts: 'include', testContent: 'include' },
  });

  return [...emit({ config, assembly, outputDirectory: OUTPUT, messages: messages.model })];
}

const file = (generated: readonly GeneratedFile[], path: string): string => {
  const found = generated.find((f) => f.path === path);

  if (found === undefined) throw new Error(`Not generated: ${path}`);

  return found.contents;
};

/** Compiles the generated modules, the message modules and an app, in memory. */
function typecheck(modules: { fr?: Module; en?: Module; app?: string }): string[] {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      exactOptionalPropertyTypes: true,
      noUncheckedIndexedAccess: true,
    },
  });

  project.createSourceFile('/project/package.json', JSON.stringify({ type: 'module' }));

  // What an app's typecheck reads: the declarations only.
  for (const generated of generate().filter((f) => f.path.endsWith('.d.ts'))) {
    project.createSourceFile(`${OUTPUT}/${generated.path}`, generated.contents);
  }

  project.createSourceFile('/project/messages/fr.ts', moduleSource(modules.fr ?? FR, 'ReferenceMessages'));
  project.createSourceFile('/project/messages/en.ts', moduleSource(modules.en ?? EN, 'Messages'));
  project.createSourceFile('/project/app.ts', modules.app ?? 'export {};');

  return project
    .getPreEmitDiagnostics()
    .map(
      (d) =>
        `${d.getSourceFile()?.getBaseName() ?? '?'}:${String(d.getLineNumber())} ${ts.flattenDiagnosticMessageText(d.compilerObject.messageText, ' ')}`,
    );
}

describe('emit: messages', () => {
  it('emits the message types and loader, and locale metadata', () => {
    const generated = generate();

    expect(generated.map((f) => f.path).filter((path) => path.startsWith('messages/'))).toEqual([
      'messages/index.d.ts',
      'messages/index.js',
      'messages/types.d.ts',
    ]);
    expect(file(generated, 'locales/index.js')).toContain('"label": "Français"');
    expect(file(generated, 'messages/types.d.ts')).toMatchSnapshot();
    expect(file(generated, 'messages/index.js')).toMatchSnapshot();
    expect(file(generated, 'messages/index.d.ts')).toMatchSnapshot();
  });

  it('valid message modules and an app using them typecheck', () => {
    const app = `
import { loadMessages, type MessageKey, type Messages, type MessageTable } from './.figatellultimate/messages/index.js';
import { localeInfo } from './.figatellultimate/locales/index.js';

const key: MessageKey = 'content.blog.patch-notes.$.title';
const taxonomy: MessageKey = 'taxonomies.tags.bot.label';
const posts: MessageTable['home.posts'] = { count: 3 };
const greeting: MessageTable['home.greeting'] = { gender: 'female', name: 'Ada', day: new Date() };
const open: MessageTable['home.greeting'] = { gender: 'anything', name: 2, day: 0 };
const badge: MessageTable['home.badge'] = { '1st': 'gold', '🎉': 'party', 0: 'zero' };
// @ts-expect-error every argument, whatever its name
const half: MessageTable['home.badge'] = { '1st': 'gold' };
const dir: 'ltr' | 'rtl' = localeInfo.en.dir;
export async function load(): Promise<Messages> {
  return loadMessages('en');
}
// @ts-expect-error unknown key
const typo: MessageKey = 'content.blog.patch-note.$.title';
// @ts-expect-error count is a number
const wrong: MessageTable['home.posts'] = { count: 'three' };
const none: MessageTable['home.title'] = undefined; // no argument
// @ts-expect-error 'home.title' takes no argument
const extra: MessageTable['home.title'] = { name: 'x' };
void [key, taxonomy, posts, greeting, open, badge, half, dir, typo, wrong, none, extra];
`;

    expect(typecheck({ app })).toEqual([]);
  });

  it('a locale missing a key, or with an extra one, fails its own typecheck', () => {
    const missing = variant(EN, (m) => delete home(m)['title']);
    const extra = variant(EN, (m) => (home(m)['titel'] = 'typo'));
    const missingContent = variant(EN, (m) => delete patchNotes(m)['bot']);

    expect(typecheck({ en: missing }).join('\n')).toMatch(/en\.ts.*"title"' is missing/);
    expect(typecheck({ en: extra }).join('\n')).toMatch(/en\.ts.*titel/);
    expect(typecheck({ en: missingContent }).join('\n')).toMatch(/en\.ts.*"bot"' is missing/);
    // The reference is free outside the content, but not inside it.
    expect(typecheck({ fr: variant(FR, (m) => (home(m)['extra'] = 'ok')) })).toEqual([]);
    expect(typecheck({ fr: variant(FR, (m) => delete patchNotes(m)['bot']) }).join('\n')).toMatch(
      /fr\.ts.*"bot"' is missing/,
    );
  });
});

describe('emit: the message skeleton', () => {
  /** The app's schema as the example writes it: figatellultimate's skeleton spread, then the app's own keys as holes. */
  const SCHEMA = `import { skeleton, type MessageSchema, type MessagesOf } from '../.figatellultimate/messages/index.js';

const _ = '';
export const schema = {
  ...skeleton,
  home: { posts: _, greeting: _, badge: _, title: _ },
} as const satisfies MessageSchema;

export type AppMessages = MessagesOf<typeof schema>;
`;
  const locale = (messages: Module): string =>
    `import type { AppMessages } from './schema.js';\n\nconst messages = ${JSON.stringify(messages)} as const satisfies AppMessages;\n\nexport default messages;\n`;

  function typecheckSchema(schema: string, modules: { fr?: Module; en?: Module }): string[] {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        exactOptionalPropertyTypes: true,
      },
    });

    project.createSourceFile('/project/package.json', JSON.stringify({ type: 'module' }));

    for (const generated of generate().filter((f) => f.path.endsWith('.d.ts'))) {
      project.createSourceFile(`${OUTPUT}/${generated.path}`, generated.contents);
    }

    project.createSourceFile('/project/messages/schema.ts', schema);
    project.createSourceFile('/project/messages/fr.ts', locale(modules.fr ?? FR));
    project.createSourceFile('/project/messages/en.ts', locale(modules.en ?? EN));

    return project
      .getPreEmitDiagnostics()
      .map(
        (d) =>
          `${d.getSourceFile()?.getBaseName() ?? '?'}:${String(d.getLineNumber())} ${ts.flattenDiagnosticMessageText(d.compilerObject.messageText, ' ')}`,
      );
  }

  it('emits the content part as a value with holes, the one place its shape enters the app', () => {
    const generated = generate();

    expect(file(generated, 'messages/index.js')).toContain('export const skeleton = Object.freeze(');
    expect(file(generated, 'messages/index.d.ts')).toContain('export declare const skeleton: ContentSkeleton;');
  });

  it('every locale, the default one included, satisfies the schema composed from it', () => {
    expect(typecheckSchema(SCHEMA, {})).toEqual([]);
  });

  it('a key missing in any locale, its content part included, does not compile', () => {
    expect(typecheckSchema(SCHEMA, { fr: variant(FR, (m) => delete patchNotes(m)['bot']) }).join('\n')).toMatch(
      /fr\.ts.*"bot"' is missing/,
    );
    expect(typecheckSchema(SCHEMA, { en: variant(EN, (m) => delete home(m)['title']) }).join('\n')).toMatch(
      /en\.ts.*'title' is missing/,
    );
    expect(typecheckSchema(SCHEMA, { fr: variant(FR, (m) => (home(m)['titel'] = 'typo')) }).join('\n')).toMatch(
      /fr\.ts.*titel/,
    );
  });

  it('a schema without the skeleton does not compile: the content part cannot be forgotten', () => {
    expect(typecheckSchema(SCHEMA.replace('  ...skeleton,\n', ''), {}).join('\n')).toMatch(/schema\.ts.*content/);
  });
});

describe('emit: messages for the use-intl adapter', () => {
  const withRuntime: FigatellultimateConfig = defineConfig({
    ...config,
    messages: { directory: 'messages', runtime: 'use-intl' },
  });

  it('registers the table, the namespaces, the shape and the locales with the adapter', () => {
    const analysis = analyze({ locales: config.locales, collections: config.collections, sources: SOURCES });
    const tree = contentMessageTree({
      collections: config.collections,
      taxonomies: config.taxonomies ?? {},
      entries: analysis.entries,
    });
    const model = analyzeMessages({ locales: config.locales, tree, modules: { 'fr.ts': FR, 'en.ts': EN } }).model;
    const assembly = assemble({
      analysis,
      documents: SOURCES.map((s) => ({ ...s, data: {}, body: '' })),
      sourceDiagnostics: [],
      collections: config.collections,
      taxonomies: config.taxonomies ?? {},
      environment: { drafts: 'include', testContent: 'include' },
    });
    const generated = [...emit({ config: withRuntime, assembly, outputDirectory: OUTPUT, messages: model })];
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
      },
    });

    project.createSourceFile('/project/package.json', JSON.stringify({ type: 'module' }));
    // A minimal stand-in for the adapter: only its `Register` interface matters here.
    project.createSourceFile(
      '/project/node_modules/@figatellultimate/use-intl/package.json',
      JSON.stringify({ name: '@figatellultimate/use-intl', type: 'module', types: 'index.d.ts' }),
    );
    project.createSourceFile(
      '/project/node_modules/@figatellultimate/use-intl/index.d.ts',
      'export interface Register {}\nexport type Registered<K extends string> = Register extends Record<K, infer T> ? T : never;\n',
    );

    for (const file of generated.filter((f) => f.path.endsWith('.d.ts'))) {
      project.createSourceFile(`${OUTPUT}/${file.path}`, file.contents);
    }

    project.createSourceFile('/project/messages/fr.ts', moduleSource(FR, 'ReferenceMessages'));
    project.createSourceFile('/project/messages/en.ts', moduleSource(EN, 'Messages'));
    project.createSourceFile(
      '/project/app.ts',
      `import type { Registered } from '@figatellultimate/use-intl';
import type { MessageTable } from './.figatellultimate/messages/index.js';
const args: Registered<'table'>['home.posts'] = { count: 1 };
const scope: Registered<'namespace'> = 'content.blog.patch-notes';
const locale: Registered<'locale'> = 'en';
// @ts-expect-error not a group
const leaf: Registered<'namespace'> = 'home.posts';
export const same: Registered<'table'> extends MessageTable ? true : false = true;
void [args, scope, locale, leaf];
`,
    );
    const errors = project
      .getPreEmitDiagnostics()
      .map(
        (d) =>
          `${d.getSourceFile()?.getBaseName() ?? '?'}: ${ts.flattenDiagnosticMessageText(d.compilerObject.messageText, ' ')}`,
      );

    expect(errors).toEqual([]);
    expect(generated.find((f) => f.path === 'messages/types.d.ts')?.contents).toContain(
      'declare module "@figatellultimate/use-intl"',
    );
  });
});
