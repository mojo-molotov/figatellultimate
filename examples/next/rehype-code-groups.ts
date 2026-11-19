/**
 * Consecutive code blocks marked with a package manager (```sh npm, then ```sh pnpm…) shown as tabs: grouped here,
 * rendered by `CodeTabs` (`@figatellultimate/ui`) through the MDX `div`. The author writes each variant; nothing is
 * converted, so nothing can be wrong or fail the build. A marked block alone stays a plain block.
 */

/** The markers a block may carry, and the tab each one names: the commands' own names, lowercase. */
const LABELS: Readonly<Record<string, string>> = { npm: 'npm', pnpm: 'pnpm', yarn: 'yarn', bun: 'bun' };

/** The part of a hast node this plugin reads and writes: structural, so that no hast types are required. */
interface Node {
  readonly type: string;
  readonly tagName?: string | undefined;
  readonly value?: string | undefined;
  readonly properties?: Readonly<Record<string, unknown>> | undefined;
  readonly data?: { readonly meta?: unknown } | undefined;
  children?: Node[] | undefined;
}

/** A code block's tab: its marker's label, `undefined` for any other node. */
function labelOf(node: Node): string | undefined {
  if (node.type !== 'element' || node.tagName !== 'pre') return undefined;

  const code = node.children?.find((child) => child.type === 'element' && child.tagName === 'code');
  const meta = code?.data?.meta;

  return typeof meta === 'string' ? LABELS[meta.trim()] : undefined;
}

const isBlank = (node: Node): boolean => node.type === 'text' && (node.value ?? '').trim() === '';

/**
 * Groups consecutive marked code blocks (two at least, blank lines between them allowed) into a
 * `div[data-code-group]` of `div[data-label]`s, each holding one block.
 *
 * @returns The rehype plugin; put it before the highlighter, which keeps each block's own language.
 */
export function rehypeCodeGroups(): (tree: Node) => void {
  const visit = (parent: Node): void => {
    const children = parent.children ?? [];
    const grouped: Node[] = [];
    let index = 0;

    while (index < children.length) {
      const child = children[index];

      if (child === undefined) break;

      const run: Node[] = [];
      let next = index;

      // The marked blocks from here on, the blank text between them skipped.
      while (next < children.length) {
        const candidate = children[next];

        if (candidate === undefined) break;

        if (labelOf(candidate) !== undefined) run.push(candidate);
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
            properties: { dataLabel: labelOf(block) },
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
