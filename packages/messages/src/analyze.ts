/**
 * The message analysis: every locale's module against the keys the content requires and against the default
 * locale's reference, every ICU message parsed, and the reference modeled for the code generator.
 *
 * Architecture:
 *     contentMessageTree (core) ──┐
 *     messages/<locale>.ts ───────┼─> analyzeMessages ──> { model, diagnostics }
 *     (loaded by the CLI)         │        ├─ the content namespaces (`content`, `taxonomies`): against the tree
 *                                 │        ├─ every other key: against the default locale's (the reference)
 *                                 │        └─ every message: analyzeIcu (syntax, `other`, plural categories, args)
 *
 * Key design decisions:
 *     - Content-derived keys live in their own namespaces (`content.<collection>.<folder>…`, `taxonomies.<taxonomy>.
 *       <term>`), a node's own fields under `$`: collisions are impossible by construction, and adding a folder or a
 *       term adds required keys to every locale.
 *     - The default locale's module is the reference for the app's own keys: no separate schema to keep in sync;
 *       every other locale must have exactly its keys, with the same ICU arguments.
 *     - ICU MessageFormat, parsed here at build time: argument types are generated for the app, so its typecheck
 *       never parses messages, and a missing plural form is a diagnostic.
 *     - Pure: the caller loads the modules; nothing is read here.
 *
 * Invariants (`analyze.test.ts`):
 *     - Every folder and term the content requires is a key in every locale, the reference included.
 *     - Outside the content namespaces, every locale has exactly the reference's keys; unknown ones come with
 *       suggestions.
 *     - Every message parses, every plural has `other`, every locale's arguments match the reference's.
 *     - The plural categories a locale uses are checked, as warnings; exact `=n` selectors do not count.
 *     - A problem is reported once; diagnostics are sorted by file, then key order.
 *
 * Limitations:
 *     - Rich-text tags (`<b>…</b>`) are read as plain text.
 *     - A select's options are not compared across locales.
 */
import { suggest, type Locales, type MessageNode, type MessageTree } from '@figatellultimate/core';

import type { MessageDiagnostic } from './diagnostics.js';
import { analyzeIcu, signature } from './icu.js';
import type { ArgumentType, MessagesModel, ShapeNode } from './model.js';

type Group = Extract<ShapeNode, { kind: 'group' }>;
type Raw = string | { readonly [key: string]: Raw };

/** Namespaces derived from the content: checked against the required tree, not against the reference. */
const CONTENT_ROOTS: readonly string[] = ['content', 'taxonomies'];
const EMPTY_ARGS: Readonly<Record<string, ArgumentType>> = Object.freeze({});

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const group = (children: Record<string, ShapeNode>): Group => ({ kind: 'group', children });
const message = (args: Readonly<Record<string, ArgumentType>>): ShapeNode => ({ kind: 'message', args });
const join = (path: readonly string[]): string => path.join('.');

function describe(value: unknown): string {
  if (value === null) return 'null';

  if (Array.isArray(value)) return 'array';

  return typeof value;
}

/** The required part of the messages, as a shape: `$` groups a node's own fields. */
function requiredShape(tree: MessageTree): Group {
  const node = (source: MessageNode): Group => {
    const children: Record<string, ShapeNode> = {};

    if (source.fields.length > 0) {
      children['$'] = group(Object.fromEntries(source.fields.map((field) => [field, message(EMPTY_ARGS)])));
    }

    for (const [value, child] of Object.entries(source.children)) children[value] = node(child);

    return group(children);
  };
  const content = Object.fromEntries(
    Object.entries(tree.content)
      .map(([name, root]): [string, Group] => [name, node(root)])
      .filter(([, shape]) => Object.keys(shape.children).length > 0),
  );
  const taxonomies = Object.fromEntries(
    Object.entries(tree.taxonomies).map(([name, terms]) => [
      name,
      group(
        Object.fromEntries(
          Object.entries(terms).map(([term, fields]) => [
            term,
            group(Object.fromEntries(fields.map((field) => [field, message(EMPTY_ARGS)]))),
          ]),
        ),
      ),
    ]),
  );
  const root: Record<string, ShapeNode> = {};

  if (Object.keys(content).length > 0) root['content'] = group(content);

  if (Object.keys(taxonomies).length > 0) root['taxonomies'] = group(taxonomies);

  return group(root);
}

/**
 * The module's default export as nested texts. Values that are neither texts nor groups are reported and left out,
 * so that the rest of the module is still checked.
 */
function readModule(
  value: unknown,
  path: readonly string[],
  report: (key: string | null, found: string) => void,
): Raw | undefined {
  if (typeof value === 'string') return value;

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    report(path.length === 0 ? null : join(path), describe(value));

    return undefined;
  }

  const result: Record<string, Raw> = {};

  for (const [key, child] of Object.entries(value)) {
    const read = readModule(child, [...path, key], report);

    if (read !== undefined) result[key] = read;
  }

  return result;
}

/** The reference shape: the required tree, completed outside the content namespaces by the default locale's keys. */
function referenceShape(
  required: Group,
  reference: Raw | undefined,
  args: ReadonlyMap<string, Readonly<Record<string, ArgumentType>>>,
): Group {
  const build = (raw: Raw, path: readonly string[]): ShapeNode =>
    typeof raw === 'string'
      ? message(args.get(join(path)) ?? EMPTY_ARGS)
      : group(Object.fromEntries(Object.entries(raw).map(([key, child]) => [key, build(child, [...path, key])])));
  // Content leaves take the reference's arguments when it has them.
  const withArgs = (shape: ShapeNode, path: readonly string[]): ShapeNode =>
    shape.kind === 'message'
      ? message(args.get(join(path)) ?? EMPTY_ARGS)
      : group(
          Object.fromEntries(
            Object.entries(shape.children).map(([key, child]) => [key, withArgs(child, [...path, key])]),
          ),
        );
  const children: Record<string, ShapeNode> = {};

  for (const [key, child] of Object.entries(required.children)) children[key] = withArgs(child, [key]);

  if (typeof reference === 'object') {
    for (const [key, child] of Object.entries(reference)) {
      if (!CONTENT_ROOTS.includes(key)) children[key] = build(child, [key]);
    }
  }

  return group(children);
}

/**
 * Checks every locale's messages, and models the reference for the codegen.
 *
 * @param input - The declared locales, the tree the content requires (core's `contentMessageTree`), and the default
 *   export of each message module found, by file name (`fr.ts`), loaded by the caller.
 * @returns The model (the reference's keys and arguments, the required tree, each locale's file) and the
 *   diagnostics, sorted by file then in the order of the keys; a problem is reported once.
 *
 * @example
 * const { model, diagnostics } = analyzeMessages({ locales, tree: contentMessageTree(input), modules });
 */
export function analyzeMessages(input: {
  readonly locales: Locales;
  readonly tree: MessageTree;
  /** The default export of each message module found, by file name (`fr.ts`). */
  readonly modules: Readonly<Record<string, unknown>>;
}): { model: MessagesModel; diagnostics: readonly MessageDiagnostic[] } {
  const { locales, tree, modules } = input;
  const byFile = new Map<string, MessageDiagnostic[]>();
  const push = (diagnostic: MessageDiagnostic): void => {
    byFile.set(diagnostic.file, [...(byFile.get(diagnostic.file) ?? []), diagnostic]);
  };
  const files = Object.fromEntries(locales.list.map((code) => [code, `${code}.ts`]));

  for (const name of Object.keys(modules)) {
    const code = name.replace(/\.ts$/, '');

    if (locales.list.includes(code) && name === files[code]) continue;

    push({
      code: 'unknown-message-module',
      severity: 'error',
      file: name,
      key: null,
      data: { name: code, locales: locales.list },
      suggestions: suggest(code, locales.list),
    });
  }

  const raws = new Map<string, Raw>();
  /** Keys already reported as invalid values, per locale: not reported again as missing. */
  const invalid = new Map<string, Set<string>>();

  for (const code of locales.list) {
    const file = `${code}.ts`;

    if (!(file in modules)) {
      push({
        code: 'missing-message-module',
        severity: 'error',
        file,
        key: null,
        data: { locale: code },
        suggestions: [],
      });
      continue;
    }

    const raw = readModule(modules[file], [], (key, found) => {
      if (key !== null) invalid.set(code, new Set([...(invalid.get(code) ?? []), key]));

      push({ code: 'invalid-message-module', severity: 'error', file, key, data: { found }, suggestions: [] });
    });

    if (raw !== undefined) raws.set(code, raw);
  }

  // ICU analysis of every locale, keeping the reference's arguments.
  const icu = new Map<string, Map<string, Readonly<Record<string, ArgumentType>> | null>>();

  for (const [code, raw] of raws) {
    const file = `${code}.ts`;
    const parsed = new Map<string, Readonly<Record<string, ArgumentType>> | null>();
    const visit = (value: Raw, path: readonly string[]): void => {
      if (typeof value !== 'string') {
        for (const [key, child] of Object.entries(value)) visit(child, [...path, key]);

        return;
      }

      const key = join(path);
      const analysis = analyzeIcu(value, code);

      if (!analysis.ok) {
        parsed.set(key, null);
        push({
          code: 'invalid-message-syntax',
          severity: 'error',
          file,
          key,
          data: { problem: analysis.problem, offset: analysis.offset },
          suggestions: [],
        });

        return;
      }

      parsed.set(key, analysis.args);

      for (const argument of analysis.missingOther) {
        push({ code: 'missing-plural-other', severity: 'error', file, key, data: { argument }, suggestions: [] });
      }

      for (const { argument, categories } of analysis.missingCategories) {
        push({
          code: 'missing-plural-category',
          severity: 'warning',
          file,
          key,
          data: { argument, categories },
          suggestions: [],
        });
      }
    };

    visit(raw, []);
    icu.set(code, parsed);
  }

  const reference = raws.get(locales.default);
  const referenceArgs = new Map(
    [...(icu.get(locales.default) ?? new Map<string, Readonly<Record<string, ArgumentType>> | null>())].flatMap(
      ([key, args]): [string, Readonly<Record<string, ArgumentType>>][] => (args === null ? [] : [[key, args]]),
    ),
  );
  const expected = referenceShape(requiredShape(tree), reference, referenceArgs);

  for (const [code, raw] of raws) {
    const file = `${code}.ts`;
    const isReference = code === locales.default;
    const parsed = icu.get(code);
    const compare = (shape: Group, value: Raw, path: readonly string[]): void => {
      if (typeof value === 'string') return;

      const inContent = path.length > 0 && CONTENT_ROOTS.includes(path[0] ?? '');

      for (const [key, child] of Object.entries(shape.children)) {
        const found = value[key];
        const childPath = [...path, key];

        if (invalid.get(code)?.has(join(childPath)) === true) continue;

        if (found === undefined || (typeof found === 'string') !== (child.kind === 'message')) {
          push({
            code: 'missing-message',
            severity: 'error',
            file,
            key: join(childPath),
            data: { expected: child.kind === 'message' ? 'text' : 'group' },
            suggestions: [],
          });
          continue;
        }

        if (child.kind === 'group') {
          compare(child, found, childPath);
          continue;
        }

        // Arguments must match the reference's (only when both parsed: syntax errors are reported already).
        const mine = parsed?.get(join(childPath));
        const theirs = referenceArgs.get(join(childPath));

        if (!isReference && mine !== undefined && mine !== null && theirs !== undefined) {
          const [expectedArgs, foundArgs] = [signature(theirs), signature(mine)];

          if (expectedArgs.join('\n') !== foundArgs.join('\n')) {
            push({
              code: 'message-arguments-mismatch',
              severity: 'error',
              file,
              key: join(childPath),
              data: { expected: expectedArgs, found: foundArgs },
              suggestions: [],
            });
          }
        }
      }

      for (const key of Object.keys(value)) {
        if (key in shape.children) continue;

        const topLevel = path.length === 0;
        const isContent = inContent || (topLevel && CONTENT_ROOTS.includes(key));

        // The reference defines the app's own keys; without a usable reference, they cannot be judged.
        if (!isContent && (isReference || reference === undefined)) continue;

        const siblings = Object.keys(shape.children);

        push({
          code: 'unknown-message',
          severity: 'error',
          file,
          key: join([...path, key]),
          data: { against: isContent ? 'content' : 'reference' },
          suggestions: suggest(key, siblings).map((sibling) => join([...path, sibling])),
        });
      }
    };

    compare(expected, raw, []);
  }

  const diagnostics = [...byFile.keys()].sort(compareText).flatMap((file) => byFile.get(file) ?? []);

  return { model: { reference: expected, tree, files }, diagnostics };
}
