/**
 * Small builders of type expressions and property structures shared by the generated files.
 */
import { Writers, type PropertySignatureStructure, type OptionalKind, type WriterFunction } from 'ts-morph';

import { compareText, literal, type TreeNode } from '../model.js';

type Property = OptionalKind<PropertySignatureStructure>;

/**
 * A union type of the given members (a single member stays itself).
 *
 * @param members - Type expressions or writers.
 * @returns The union; a single member as is.
 */
export function union(members: readonly (string | WriterFunction)[]): string | WriterFunction {
  const [first, second, ...rest] = members;

  if (first === undefined) return 'never';

  if (second === undefined) return first;

  return Writers.unionType(first, second, ...rest);
}

/**
 * A readonly property signature.
 *
 * @param name - The property's name.
 * @param type - Its type.
 * @param optional - Whether it is optional.
 * @returns A ts-morph property structure.
 */
export const property = (name: string, type: string | WriterFunction, optional = false): Property => ({
  name,
  type,
  isReadonly: true,
  hasQuestionToken: optional,
});

/**
 * The properties of a lookup-table level: one per value, nested object types down to the locale leaves.
 *
 * @param node - A level of the lookup table.
 * @param locales - The declared locales.
 * @returns The level's properties.
 */
export function treeProperties(node: TreeNode, locales: readonly string[]): Property[] {
  if (node.kind === 'leaf') return [];

  return [...node.children.keys()].sort(compareText).map((key) => {
    const child = node.children.get(key);

    if (child === undefined || child.kind === 'leaf') {
      const existing = locales.filter((locale) => child?.locales.has(locale) === true);

      return property(literal(key), union(existing.map(literal)));
    }

    return property(literal(key), Writers.objectType({ properties: treeProperties(child, locales) }));
  });
}

/**
 * `Tree[T0][T1]…` for the first `depth` type parameters.
 *
 * @param tree - The table type's name.
 * @param depth - How many type parameters.
 * @returns The indexed access type expression.
 */
export const indexedAccess = (tree: string, depth: number): string =>
  `${tree}${Array.from({ length: depth }, (_, i) => `[T${String(i)}]`).join('')}`;

/**
 * Union of the keys at a given depth of the table, for list filters (no dependent narrowing there): a mapped type
 * expression, e.g. `{ [K0 in keyof Tree]: keyof Tree[K0] }[keyof Tree]`.
 *
 * @param tree - The table type's name.
 * @param depth - The depth.
 * @returns The mapped type expression.
 */
export function keysAtDepth(tree: string, depth: number): string {
  const names = Array.from({ length: depth }, (_, i) => `K${String(i)}`);
  let expression = `keyof ${tree}${names.map((n) => `[${n}]`).join('')}`;

  for (let i = depth - 1; i >= 0; i--) {
    const parent = `${tree}${names
      .slice(0, i)
      .map((n) => `[${n}]`)
      .join('')}`;

    expression = `{ [${names[i] ?? 'K'} in keyof ${parent}]: ${expression} }[keyof ${parent}]`;
  }

  return expression;
}
