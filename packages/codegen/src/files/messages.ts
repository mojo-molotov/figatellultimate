/**
 * `messages/types` and `messages/index`: the content-required part, the reference and each locale's exact shape,
 * the table of keys to ICU arguments, the skeleton an app schema spreads, and a lazy loader of each locale's module
 * (by its real `.ts` extension).
 */
import { posix } from 'node:path';

import type { FigatellultimateConfig } from '@figatellultimate/core';
import type { ArgumentType, MessagesModel, ShapeNode } from '@figatellultimate/messages';
import {
  ModuleDeclarationKind,
  StructureKind,
  VariableDeclarationKind,
  Writers,
  type Project,
  type WriterFunction,
} from 'ts-morph';

import { literal } from '../model.js';
import { render, type GeneratedFile } from '../render.js';
import { property, union } from './type-builders.js';

type Group = Extract<ShapeNode, { kind: 'group' }>;

/** An object type with one readonly property per key; texts are `string`. */
function shapeType(group: Group): WriterFunction {
  return Writers.objectType({
    properties: Object.entries(group.children).map(([key, child]) =>
      property(literal(key), child.kind === 'message' ? 'string' : shapeType(child)),
    ),
  });
}

/** The same object type with every text a hole, `""`: the skeleton's type. */
function skeletonType(group: Group): WriterFunction {
  return Writers.objectType({
    properties: Object.entries(group.children).map(([key, child]) =>
      property(literal(key), child.kind === 'message' ? '""' : skeletonType(child)),
    ),
  });
}

/** The skeleton as a deeply frozen value: `Object.freeze({ … })` at every level, texts as holes. */
function skeletonValue(group: Group): WriterFunction {
  return (writer) => {
    writer.write('Object.freeze(');
    Writers.object(
      Object.fromEntries(
        Object.entries(group.children).map(([key, child]) => [
          literal(key),
          child.kind === 'message' ? '""' : skeletonValue(child),
        ]),
      ),
    )(writer);
    writer.write(')');
  };
}

/** Every text of a group, as a dot path with its arguments, in key order. */
function messages(
  group: Group,
  path: readonly string[] = [],
): { key: string; args: Readonly<Record<string, ArgumentType>> }[] {
  return Object.entries(group.children).flatMap(([key, child]) =>
    child.kind === 'message' ? [{ key: [...path, key].join('.'), args: child.args }] : messages(child, [...path, key]),
  );
}

/** Every group, as a dot path: the valid scopes of a translator. */
function groups(group: Group, path: readonly string[] = []): string[] {
  return Object.entries(group.children).flatMap(([key, child]) =>
    child.kind === 'group' ? [[...path, key].join('.'), ...groups(child, [...path, key])] : [],
  );
}

/** The TypeScript type of an ICU argument: what use-intl accepts for it. */
function argumentType(type: ArgumentType): string | WriterFunction {
  switch (type.kind) {
    case 'text':
      return 'string | number';
    case 'number':
      return 'number';
    case 'date':
      return 'Date | number';
    case 'select':
      // An open select (with `other`) still completes its known options.
      return union([...type.options.map(literal), ...(type.open ? ['(string & {})'] : [])]);
  }
}

/** The content-required part only: the namespaces of `content` and `taxonomies`. */
const requiredPart = (reference: Group): Group => ({
  kind: 'group',
  children: Object.fromEntries(
    Object.entries(reference.children).filter(([key]) => key === 'content' || key === 'taxonomies'),
  ),
});

/**
 * `messages/types.ts`: the required part, the reference, the exact shape, and the table of keys to ICU arguments.
 *
 * @param project - The in-memory ts-morph project.
 * @param config - The config.
 * @param model - The analyzed messages.
 * @returns The generated file(s), built in memory; nothing is written.
 */
export function messageTypesFile(
  project: Project,
  config: FigatellultimateConfig,
  model: MessagesModel,
): GeneratedFile[] {
  const all = messages(model.reference);

  return render(project, 'messages/types.ts', 'types', (file) => {
    file.addTypeAlias({
      name: 'ContentMessages',
      isExported: true,
      docs: ['What the content requires in every locale: one key per folder and per taxonomy term.'],
      type: shapeType(requiredPart(model.reference)),
    });
    file.addTypeAlias({
      name: 'ContentSkeleton',
      isExported: true,
      docs: ['`ContentMessages` with every text a hole: the type of `skeleton`, which an app schema spreads.'],
      type: skeletonType(requiredPart(model.reference)),
    });
    file.addTypeAlias({
      name: 'MessageSchemaNode',
      isExported: true,
      docs: ['A level of an app schema: a hole, or a group of levels.'],
      type: '"" | { readonly [key: string]: MessageSchemaNode }',
    });
    file.addTypeAlias({
      name: 'MessageSchema',
      isExported: true,
      docs: ["An app's message schema: figatellultimate's skeleton, spread, then the app's own keys as holes."],
      type: Writers.intersectionType('ContentSkeleton', '{ readonly [key: string]: MessageSchemaNode }'),
    });
    file.addTypeAlias({
      name: 'MessagesOf',
      isExported: true,
      typeParameters: ['S'],
      docs: ['What every locale writes for a schema: the same keys, a text for each hole.'],
      type: '{ readonly [K in keyof S]: S[K] extends string ? string : MessagesOf<S[K]> }',
    });
    file.addTypeAlias({
      name: 'ReferenceMessages',
      isExported: true,
      docs: ["The default locale's module: the content part is required, the app's own keys are free."],
      type: Writers.intersectionType('ContentMessages', '{ readonly [key: string]: unknown }'),
    });
    file.addTypeAlias({
      name: 'Messages',
      isExported: true,
      docs: ["Every other locale's module: exactly the reference's keys."],
      type: shapeType(model.reference),
    });
    file.addInterface({
      name: 'MessageTable',
      isExported: true,
      docs: [
        'Every message, as a dot path, to its ICU arguments from the parsed reference, or `undefined`.\n' +
          'A lookup table, not a union with conditions: typed calls stay cheap at scale.',
      ],
      properties: all.map(({ key, args }) =>
        property(
          literal(key),
          Object.keys(args).length === 0
            ? 'undefined'
            : Writers.objectType({
                properties: Object.entries(args).map(([name, type]) => property(name, argumentType(type))),
              }),
        ),
      ),
    });
    file.addTypeAlias({
      name: 'MessageKey',
      isExported: true,
      docs: ['Every message, as a dot path.'],
      type: 'keyof MessageTable',
    });
    file.addTypeAlias({
      name: 'MessageNamespace',
      isExported: true,
      docs: ['Every group of messages, as a dot path: the scopes a translator accepts.'],
      type: union(groups(model.reference).map(literal)),
    });

    if (config.messages?.runtime === 'use-intl') {
      file.insertImportDeclaration(0, {
        isTypeOnly: true,
        moduleSpecifier: '../locales/index.js',
        namedImports: ['Locale'],
      });
      file.addModule({
        name: literal('@figatellultimate/use-intl'),
        hasDeclareKeyword: true,
        declarationKind: ModuleDeclarationKind.Module,
        docs: ["Types the use-intl adapter's translators with these messages."],
        statements: [
          {
            kind: StructureKind.Interface,
            name: 'Register',
            properties: [
              property('table', 'MessageTable'),
              property('namespace', 'MessageNamespace'),
              property('messages', 'Messages'),
              property('locale', 'Locale'),
            ],
          },
        ],
      });
    }
  });
}

/**
 * `messages/index.ts`: the types, and a lazy loader of each locale's validated module.
 *
 * @param project - The in-memory ts-morph project.
 * @param config - The config.
 * @param model - The analyzed messages.
 * @returns The generated file(s), built in memory; nothing is written.
 */
export function messageIndexFile(
  project: Project,
  config: FigatellultimateConfig,
  model: MessagesModel,
): GeneratedFile[] {
  const directory = config.messages?.directory ?? 'messages';
  const output = config.output ?? '.figatellultimate';
  // From `<output>/messages/` to the messages folder, both relative to the config file: never an absolute path.
  const toMessages = posix.relative(`/${output}/messages`, `/${directory}`);
  const locales = [...config.locales.list];

  return render(project, 'messages/index.ts', 'module', (file) => {
    file.addImportDeclaration({ isTypeOnly: true, moduleSpecifier: '../locales/index.js', namedImports: ['Locale'] });
    file.addImportDeclaration({
      isTypeOnly: true,
      moduleSpecifier: './types.js',
      namedImports: ['ContentSkeleton', 'Messages'],
    });
    file.addExportDeclaration({
      isTypeOnly: true,
      moduleSpecifier: './types.js',
      namedExports: [
        'ContentMessages',
        'ContentSkeleton',
        'MessageKey',
        'MessageNamespace',
        'Messages',
        'MessageSchema',
        'MessageSchemaNode',
        'MessagesOf',
        'MessageTable',
        'ReferenceMessages',
      ],
    });
    file.addVariableStatement({
      isExported: true,
      declarationKind: VariableDeclarationKind.Const,
      docs: ["The content's required messages with every text a hole, for an app schema to spread."],
      declarations: [
        { name: 'skeleton', type: 'ContentSkeleton', initializer: skeletonValue(requiredPart(model.reference)) },
      ],
    });
    file.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: 'modules',
          type: '{ readonly [L in Locale]: () => Promise<{ readonly default: Messages }> }',
          initializer: Writers.object(
            Object.fromEntries(
              locales.map((code) => [
                literal(code),
                // The real extension: Node strips the types, bundlers resolve the real path.
                `() => import(${literal(`${toMessages}/${model.files[code] ?? `${code}.ts`}`)})`,
              ]),
            ),
          ),
        },
      ],
    });
    file.addFunction({
      name: 'loadMessages',
      isExported: true,
      isAsync: true,
      docs: ["A locale's messages, as validated at build time, loaded lazily."],
      parameters: [{ name: 'locale', type: 'Locale' }],
      returnType: 'Promise<Messages>',
      statements: ['return (await modules[locale]()).default;'],
    });
  });
}
