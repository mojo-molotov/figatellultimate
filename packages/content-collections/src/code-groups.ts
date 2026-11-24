/**
 * Consecutive code blocks marked alike (```sh npm, then ```sh pnpm…) grouped as tabs: a rehype plugin of the MDX
 * compilation, its groups rendered by `CodeTabs` (`@figatellultimate/ui`) through the MDX `div`.
 *
 * Key design decisions:
 *     - The author writes each variant; nothing is converted, so nothing can be wrong or fail the build.
 *     - A marked block alone stays a plain block: a group is two tabs at least.
 *     - Structural hast types, as `rehypeHeadings`: no dependency for the user's config to load.
 *
 * Invariants (`code-groups.test.ts`): consecutive marked blocks grouped, blank text between them allowed, each tab
 * named by its marker; a lone block, an unmarked block, a paragraph or an unknown marker break a group; groups inside
 * any element; the markers the app gives.
 */

/** The markers a block carries by default, and the tab each one names: the package managers' own names. */
const PACKAGE_MANAGERS: Readonly<Record<string, string>> = { npm: 'npm', pnpm: 'pnpm', yarn: 'yarn', bun: 'bun' };

/** The part of a hast node this plugin reads and writes: structural, so that no hast types are required. */
export interface CodeGroupNode {
  readonly type: string;
  readonly tagName?: string | undefined;
  readonly value?: string | undefined;
  readonly properties?: Readonly<Record<string, unknown>> | undefined;
  readonly data?: { readonly meta?: unknown } | undefined;
  children?: CodeGroupNode[] | undefined;
}

/** A code block's tab: its marker's label, `undefined` for any other node. */
function labelOf(node: CodeGroupNode, labels: Readonly<Record<string, string>>): string | undefined {
  if (node.type !== 'element' || node.tagName !== 'pre') return undefined;

  const code = node.children?.find((child) => child.type === 'element' && child.tagName === 'code');
  const meta = code?.data?.meta;

  return typeof meta === 'string' && Object.hasOwn(labels, meta.trim()) ? labels[meta.trim()] : undefined;
}

const isBlank = (node: CodeGroupNode): boolean => node.type === 'text' && (node.value ?? '').trim() === '';

/**
 * Groups consecutive marked code blocks (two at least, blank lines between them allowed) into a
 * `div[data-code-group]` of `div[data-label]`s, each holding one block: what `CodeTabs` of `@figatellultimate/ui`
 * shows as tabs, through the MDX `div`.
 *
 * @param options - `labels`: each marker a block may carry (its fence's meta, ```sh pnpm) and its tab's name; default
 *   the package managers, `npm`, `pnpm`, `yarn`, `bun`.
 * @returns The rehype plugin; put it before the highlighter, which keeps each block's own language.
 *
 * @example
 * compileMDX(context, document, { rehypePlugins: [rehypeCodeGroups, rehypeShiki] });
 */
export function rehypeCodeGroups(
  options: { readonly labels?: Readonly<Record<string, string>> | undefined } = {},
): (tree: CodeGroupNode) => void {
  const labels = options.labels ?? PACKAGE_MANAGERS;

  const visit = (parent: CodeGroupNode): void => {
    const children = parent.children ?? [];
    const grouped: CodeGroupNode[] = [];
    let index = 0;

    while (index < children.length) {
      const child = children[index];

      if (child === undefined) break;

      const run: CodeGroupNode[] = [];
      let next = index;

      // The marked blocks from here on, the blank text between them skipped.
      while (next < children.length) {
        const candidate = children[next];

        if (candidate === undefined) break;

        if (labelOf(candidate, labels) !== undefined) run.push(candidate);
        else if (!isBlank(candidate)) break;

        next += 1;
      }

      if (run.length >= 2) {
        grouped.push({
          type: 'element',
          tagName: 'div',
          properties: { dataCodeGroup: '' },
          children: run.map((block) => ({
            type: 'element',
            tagName: 'div',
            properties: { dataLabel: labelOf(block, labels) },
            children: [block],
          })),
        });
        index = next;

        continue;
      }

      visit(child);
      grouped.push(child);
      index += 1;
    }

    parent.children = grouped;
  };

  return visit;
}
