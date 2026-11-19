/**
 * Which message keys an app's code uses, read from its types, and which ones its schema keeps on purpose: what
 * `findUnusedMessages` (`@figatellultimate/messages`) compares the reference with.
 *
 *     the app's tsconfig.json ──> a program ──> every literal or template where message keys are expected
 *                                           └─> every call argument narrower than the keys its parameter takes
 *                                                 ├─ the namespace: the prefix that makes the accepted ones keys
 *                                                 └─ the keys named: the literal's, or the argument's, type
 *     the schema ──> each property under a `// figatellultimate-keep: <why>` comment ──> a kept key or group
 *
 * Key design decisions:
 *     - A key enters a program where it is written: a literal or a template (`ui.sort.${sort}`, a union of keys) in
 *       a place typed as message keys (an argument, a property, an array element, a return value). The type of that
 *       place says it is a key, the type of the literal which keys.
 *     - A call argument counts too when its type is narrower than what the parameter takes: a constant, a variable
 *       typed by a few keys (`(key: 'ui.a' | 'ui.b') => t(key)`). Rejected: counting every argument's type, which
 *       marked every key used, since generated data (a folder's label, a crumb's) is typed as any key: such a value
 *       says nothing, its keys are counted where they are written (here, by the content: never the app's).
 *     - Any typed place counts, not only the translators of one library: use-intl's `t`, `t.rich`, a scoped
 *       translator, an app's own helper such as `compiled(locale, key)`.
 *     - A scoped translator's namespace is read from its own signature, which has the scope applied: the accepted keys
 *       are relative, and the one prefix making them keys is the namespace (`search('found')` under `ui.search` uses
 *       `ui.search.found`). Two prefixes possible: both count.
 *     - Markers live in the schema, the one place the app's keys are written; a reason is required.
 *
 * Invariants (`__tests__/unused-e2e.test.ts`): a literal, a template, a scope and a typed variable reach their keys;
 * a marker keeps its group, only with a reason; only the message nothing reaches is warned.
 *
 * Limitations: an app that does not compile may hide uses (an unresolved call has no types); a key written where
 * nothing types it as a key (a plain `string` constant, later cast) is not seen, and is reported.
 */
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { Node, Project, ts } from 'ts-morph';

/** What the app's code uses, and what its schema keeps. */
export interface KeyUsage {
  readonly used: ReadonlySet<string>;
  /** Keys or groups kept by a marker, as dot paths. */
  readonly kept: readonly string[];
}

const KEEP = /figatellultimate-keep:\s*\S/;

/** The string literals a type is made of, or `undefined` when it is anything else. */
function literalsOf(type: ts.Type, checker: ts.TypeChecker): string[] | undefined {
  const constraint = type.isTypeParameter() ? checker.getBaseConstraintOfType(type) : type;

  if (constraint === undefined) return undefined;

  const members = constraint.isUnion() ? constraint.types : [constraint];
  const values = members.flatMap((member) => (member.isStringLiteral() ? [member.value] : []));

  return values.length > 0 && values.length === members.length ? values : undefined;
}

/** Every namespace under which all the literals are keys: `''` when they are keys themselves. */
function namespacesOf(literals: readonly string[], keys: ReadonlySet<string>, bySuffix: ReadonlyMap<string, string[]>) {
  if (literals.every((literal) => keys.has(literal))) return [''];

  const first = literals[0] ?? '';

  return (bySuffix.get(first) ?? [])
    .map((key) => key.slice(0, key.length - first.length - 1))
    .filter((namespace) => literals.every((literal) => keys.has(`${namespace}.${literal}`)));
}

/** The dot path of an object property: the names of the properties around it, outermost first. */
function pathOf(node: Node): string[] {
  const names: string[] = [];

  for (let current: Node | undefined = node; current !== undefined; current = current.getParent()) {
    if (Node.isPropertyAssignment(current)) names.unshift(current.getName().replace(/^['"]|['"]$/g, ''));
  }

  return names;
}

/**
 * The keys an app's code uses, and the ones its schema keeps.
 *
 * @param input - The app's root (its `tsconfig.json` there), every key of the reference, the folders whose files are
 *   not the app's code (the generated output, the messages), and the files that may hold markers (the schema).
 * @returns The used keys and the kept ones; `undefined` without a `tsconfig.json`, when the app cannot be typed.
 *
 * @example
 * scanKeyUsage({ directory, keys: referenceKeys(model), skip: [output, messages], markers: [schema] });
 */
export function scanKeyUsage(input: {
  readonly directory: string;
  readonly keys: readonly string[];
  readonly skip: readonly string[];
  readonly markers: readonly string[];
}): KeyUsage | undefined {
  const tsConfigFilePath = join(input.directory, 'tsconfig.json');

  if (!existsSync(tsConfigFilePath)) return undefined;

  const project = new Project({ tsConfigFilePath });
  const checker = project.getTypeChecker().compilerObject;
  const keys = new Set(input.keys);
  const bySuffix = new Map<string, string[]>();

  for (const key of input.keys) {
    const segments = key.split('.');

    for (let i = 1; i < segments.length; i++) {
      const suffix = segments.slice(i).join('.');

      bySuffix.set(suffix, [...(bySuffix.get(suffix) ?? []), key]);
    }
  }

  const used = new Set<string>();
  const isApp = (path: string): boolean => {
    const local = relative(input.directory, path);

    return (
      !local.startsWith('..') &&
      !local.split(sep).includes('node_modules') &&
      !input.skip.some((folder) => !relative(folder, path).startsWith('..'))
    );
  };

  /** Records the keys a set of literals names, under each namespace where the accepted ones are keys. */
  const use = (accepted: readonly string[], named: readonly string[]): void => {
    for (const namespace of namespacesOf(accepted, keys, bySuffix)) {
      for (const literal of named) used.add(namespace === '' ? literal : `${namespace}.${literal}`);
    }
  };

  const visit = (node: ts.Node): void => {
    // A key written where keys are expected: an argument, a property, an element, a return value.
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      const contextual = checker.getContextualType(node);
      const accepted = contextual === undefined ? undefined : literalsOf(contextual, checker);
      const named = literalsOf(checker.getTypeAtLocation(node), checker);

      if (accepted !== undefined && named !== undefined) use(accepted, named);
    }

    // A value narrower than what the function takes: a constant, a variable typed by a few keys.
    if (ts.isCallExpression(node)) {
      const signature = checker.getResolvedSignature(node);
      // The callee's own signatures, not its declaration's: a scoped translator's type has its namespace applied, so
      // the constraint of its key is the keys of that scope.
      const declared = checker.getTypeAtLocation(node.expression).getCallSignatures();

      node.arguments.forEach((_, index) => {
        const parameter = signature?.parameters[index];
        const accepted = declared
          .map((candidate) => candidate.parameters[index])
          .map((symbol) => (symbol === undefined ? undefined : literalsOf(checker.getTypeOfSymbol(symbol), checker)))
          .find((literals) => literals !== undefined);
        const named = parameter === undefined ? undefined : literalsOf(checker.getTypeOfSymbol(parameter), checker);

        // Typed as any key it takes, it says nothing: its keys are counted where they are written.
        if (accepted !== undefined && named !== undefined && named.length < accepted.length) use(accepted, named);
      });
    }

    ts.forEachChild(node, visit);
  };

  for (const file of project.getSourceFiles()) {
    if (!file.isDeclarationFile() && isApp(file.getFilePath())) visit(file.compilerNode);
  }

  const kept = input.markers.flatMap((path) => {
    if (!existsSync(path)) return [];

    const file = project.getSourceFile(path) ?? project.addSourceFileAtPath(path);

    return file
      .getDescendants()
      .filter(Node.isPropertyAssignment)
      .filter((property) => property.getLeadingCommentRanges().some((range) => KEEP.test(range.getText())))
      .map((property) => pathOf(property).join('.'));
  });

  return { used, kept };
}
